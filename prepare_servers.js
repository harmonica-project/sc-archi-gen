const execSync = require('child_process').execSync;
const fs = require('fs');
const YAML = require('yaml');
const path = require('path');

var Client = require('ssh2').Client;

var genesis = require('./ethereum/template_genesis.json');
var machines = require('./ip_list.json');

const BLOCK_PERIOD = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).BLOCK_PERIOD;
const SSH_KEY = getSSHKey();
const NODE_DIR = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).NODE_WORKING_DIR;

async function setupMachines() {
    for(var i = 0; i < machines.length; i++) {
        await setupMachine(machines[i], i);
    }
    console.log(machines)
}

function getSSHKey() {
    var SSHKeyConfigPath = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).SSH_KEY;
    if(SSHKeyConfigPath != '') {
        return SSHKeyConfigPath;
    }
    else {
        return process.env.HOME + '/.ssh/id_rsa';
    }
}

function getMachineAddress(i) {
    var file = fs.readdirSync('./ethereum/datadir/keystore')[i];
    var keystore = fs.readFileSync('./ethereum/datadir/keystore/' + file, "utf8");
    return JSON.parse(keystore).address;
}

function getMachineNodekey(i) {
    return execSync('bootnode -nodekey ./ethereum/datadir/nodekeys/nodekey' + i + ' --writeaddress').toString().replace('\n', '');
}

function createEthFiles() {
    var staticNodes = [];

    genesis.extraData = "0x0000000000000000000000000000000000000000000000000000000000000000";
    genesis.config.clique.period = BLOCK_PERIOD;
    
    for(var i = 0; i < machines.length; i++) {
        console.log("Creating key and nodekey " + (i+1) + " ...")
        execSync('geth account new --datadir ./ethereum/datadir --password ./ethereum/password', { encoding: 'utf-8' });
        execSync('bootnode -genkey ./ethereum/datadir/nodekeys/nodekey' + i, { encoding: 'utf-8' });
        var address = getMachineAddress(i);
        var nodekey = getMachineNodekey(i);

        genesis.alloc[address] = {
            balance: "0x20000000000000000"
        }

        genesis.extraData += address;
        machines[i].address = '0x' + address;
        machines[i].nodekey = nodekey;
        staticNodes.push('enode://' + nodekey + '@' + machines[i].ip + ':30303');
    }

    genesis.extraData += "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync("./ethereum/genesis.json", JSON.stringify(genesis)); 
    fs.writeFileSync("./ethereum/static-nodes.json", JSON.stringify(staticNodes)); 
}

function setupMachine(machine, i) {
    return new Promise(function (resolve, reject) {
        console.log("Machine " + machine.ip + " setup ...")
        var conn = new Client();

        conn.on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish, machine) {
            finish(machine.password);
        })
        
        conn.on('ready', async function () {
            await setupDirectory(conn, machine);
            await transferEthFiles(conn, i);
            await initEthDatabase(conn, machine);
            await launchNode(conn, machine);

            conn.end();
            resolve(true);
        })
    
        if(machine.password) {
            conn.connect({
                host: machine.ip,
                username: machine.user,
                port: 22,
                readyTimeout: 100000,
                password: machine.password
            });
        }
        else {
            conn.connect({
                host: machine.ip,
                username: machine.user,
                port: 22,
                readyTimeout: 100000,
                privateKey: require('fs').readFileSync(SSH_KEY)
            });
        }
    });
}

function setupDirectory(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.exec('sudo rm -rf ' + NODE_DIR + '* ; mkdir -p ' + NODE_DIR + 'datadir/keystore ; mkdir -p ' + NODE_DIR + 'datadir/geth ; pkill -9 geth; sudo rm /var/log/geth.log; sudo touch /var/log/geth.log; sudo chmod 777 /var/log/geth.log', function(err, stream) {
            if(err) {
                console.error(err);
                reject(false);
            }
            else {
                stream.on('close', function() {
                    resolve(true); 
                }).on('data', function(data) {
                    console.log('Machine ' + machine.ip + ': ' + data);
                  }).stderr.on('data', function(data) {
                    console.log('Machine ' + machine.ip + ': ' + data);
                  });
            }
        });
    });
}

function initEthDatabase(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.exec('geth --datadir ' + NODE_DIR + 'datadir init ' + NODE_DIR + 'genesis.json', function(err, stream) {
            if(err) {
                console.error(err);
                reject(false);
            }
            else {
                stream.on('close', function() {
                    resolve(true); 
                }).on('data', function(data) {
                  }).stderr.on('data', function(data) {
                    console.log('Machine ' + machine.ip + ': ' + data);
                  });
            }
        });
    });
}

function launchNode(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.exec('nohup geth --datadir "' + NODE_DIR + 'datadir" --networkid 61795847 --nodekey ' + NODE_DIR + 'datadir/geth/nodekey --rpc --rpcport 8545 --rpcaddr ' + machine.ip + ' --rpccorsdomain "*" --rpcapi "eth,net,web3,personal,miner,admin,clique,txpool" --allow-insecure-unlock --unlock ' + machine.address + ' --password ' + NODE_DIR + 'password &>/var/log/geth.log --gasprice 0 --mine --nodiscover --syncmode "full" --txpool.accountslots 1000000 --txpool.globalslots 1000000 --txpool.accountqueue 1000000 --txpool.globalqueue 1000000 &', function(err) {
            if(err) {
                console.error(err);
                reject(false);
            }
            else {
                conn.exec('disown', function(err, stream) {
                    if(err) {
                        console.error(err);
                        reject(false);
                    }
                    else {
                        stream.on('close', function() {
                            resolve(true); 
                        }).on('data', function(data) {
                            resolve(true); 
                        });
                    }
                });
            }
        });
    })
}

function transferEthFiles(conn, i) {
    return new Promise(function(resolve, reject) {
        conn.sftp(function(err, sftp) {
            var files = fs.readdirSync('./ethereum/datadir/keystore');
            
            sftp.fastPut('./ethereum/datadir/keystore/' + files[i], NODE_DIR + 'datadir/keystore/key.json', function(err) {
                if(err) {
                    console.error(err);
                    reject(false);
                }
                else {
                    sftp.fastPut('./ethereum/genesis.json', NODE_DIR + 'genesis.json', function(err) {
                        if(err) {
                            console.error(err);
                            reject(false);
                        }
                        else {
                            sftp.fastPut('./ethereum/password', NODE_DIR + 'password', function(err) {
                                if(err) {
                                    console.error(err);
                                    reject(false);
                                }
                                else {
                                    sftp.fastPut('./ethereum/datadir/nodekeys/nodekey' + i, NODE_DIR + 'datadir/geth/nodekey', function(err) {
                                        if(err) {
                                            console.error(err);
                                            reject(false);
                                        }
                                        else {
                                            sftp.fastPut('./ethereum/static-nodes.json', NODE_DIR + 'datadir/geth/static-nodes.json', function(err) {
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
                                }
                            });
                        }
                    });
                }
            });
        });
    });
}

////////////////////////////////////////

execSync('rm -rf ./ethereum/datadir/* ; mkdir ./ethereum/datadir ; mkdir ./ethereum/datadir/nodekeys');

createEthFiles();
setupMachines()
.then(function() {
    fs.writeFileSync("./ip_list.json", JSON.stringify(machines));
    console.log("Machines setup done.")
})
