const execSync = require('child_process').execSync;
const fs = require('fs');
var Client = require('ssh2').Client;

var genesis = require('./ethereum/template_genesis.json');
var machines = require('./ip_list.json');

async function setupMachines() {
    for(var i = 0; i < machines.length; i++) {
        await setupMachine(machines[i]);
    }
}

function createAccountAndGenesis() {
    for(var i = 0; i < machines.length; i++) {
        execSync('geth account new --datadir ./ethereum/datadir --password ./ethereum/password', { encoding: 'utf-8' });
        var file = fs.readdirSync('./ethereum/datadir/keystore')[i];
        var keystore = fs.readFileSync('./ethereum/datadir/keystore/' + file, "utf8");
        var address = JSON.parse(keystore).address;
    
        genesis.alloc[address] = {
            balance: "2000000000000"
        }
    }
    
    fs.writeFileSync("./ethereum/genesis.json", JSON.stringify(genesis)); 
}

function setupMachine(machine) {
    return new Promise(function(resolve, reject) {
        var conn = new Client();

        conn.on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish, machine) {
            finish(machine.password);
        })
        
        conn.on('ready', function () {
            setupDirectory(conn)
            .then(transferEthFiles(conn, machine))
            .then(initEthDatabase(conn))
            .then(initBootnodeOnFirstNode(conn, machine))
            .then(function () {
                conn.end();
                resolve(true);
            })
        })

        conn.connect({
                host: machine.ip,
                username: machine.user,
                password: machine.password,
                port: 22,
                readyTimeout: 100000
        });
    })
}

function setupDirectory(conn) {
    return new Promise(function(resolve, reject) {
        conn.exec('rm -rf datadir genesis.json boot.key && mkdir -p /home/vagrant/datadir/keystore', function(err) {
            if(err) {
                console.error(err);
                reject(false);
            }
            else resolve(true);
        });
    });
}

function initEthDatabase(conn) {
    return new Promise(function(resolve, reject) {
        conn.exec('geth --datadir .datadir init genesis.json', function(err) {
            if(err) {
                console.error(err);
                reject(false);
            }
            else resolve(true);
        });
    });
}

function initBootnodeOnFirstNode(conn, machine) {
    return new Promise(function(resolve, reject) {
        if(machine.id == 0) {
            conn.exec('bootnode --genkey=boot.key', function(err) {
                if(err) {
                    console.error(err);
                    reject(false);
                }
                else {
                    conn.exec('bootnode --nodekey=boot.key -addr ' + machine.ip + ':30300', function(err, stream) {
                        if(err) {
                            console.error(err);
                            reject(false);
                        }
                        else {
                            stream.on('data', function(data) {
                                console.log('STDOUT: ' + data);      
                            })
                            resolve(true);
                        }
                    });
                }
            });
        }
        else {
            resolve(true);
        }
    })
}

function transferEthFiles(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.sftp(function(err, sftp) {
            var files = fs.readdirSync('./ethereum/datadir/keystore');
            
            sftp.fastPut('./ethereum/datadir/keystore/' + files[machine.id], '/home/vagrant/datadir/keystore/key.json', function(err) {
                if(err) {
                    console.error(err);
                    reject(false);
                }
                else {
                    sftp.fastPut('./ethereum/genesis.json', '/home/vagrant/genesis.json', function(err) {
                        if(err) {
                            console.error(err);
                            reject(false);
                        }
                        else {
                            sftp.end();
                            resolve(true);
                        }
                    });
                }
            });
        });
    });
}

////////////////////////////////////////

execSync('rm -rf ./ethereum/datadir/*');

createAccountAndGenesis();
setupMachines()
.then(function() {
    console.log("Machines setup done.")
})
