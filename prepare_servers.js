const execSync = require('child_process').execSync;
const fs = require('fs');
var Client = require('ssh2').Client;

var genesis = require('./ethereum/template_genesis.json');
var machines = require('./ip_list.json');

var SSH_KEY = '/root/.ssh/id_rsa';
var NODE_DIR = '/home/vagrant/';

async function setupMachines() {
    for(var i = 0; i < machines.length; i++) {
        await setupMachine(machines[i], i);
    }
    console.log(machines)
}

function getMachineAddress(i) {
    var file = fs.readdirSync('./ethereum/datadir/keystore')[i];
    var keystore = fs.readFileSync('./ethereum/datadir/keystore/' + file, "utf8");
    return JSON.parse(keystore).address;
}

function createAccountAndGenesis() {
    genesis.extraData = "0x0000000000000000000000000000000000000000000000000000000000000000";

    for(var i = 0; i < machines.length; i++) {
        console.log("Creating key " + i + " ...")
        execSync('geth account new --datadir ./ethereum/datadir --password ./ethereum/password', { encoding: 'utf-8' });
        var address = getMachineAddress(i);
    
        genesis.alloc[address] = {
            balance: "0x20000000000000000"
        }

        genesis.extraData += address;
        machines[i].address = '0x' + address;
    }

    genesis.extraData += "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    fs.writeFileSync("./ethereum/genesis.json", JSON.stringify(genesis)); 
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
            await initBootnodeOnFirstNode(conn, machine, i);
            await genBootnodeEnodeAddr(conn, machine, i);
            await launchBootnodeOnFirstNode(conn, machine, i);
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
        conn.exec('rm -rf ' + NODE_DIR + 'datadir ' + NODE_DIR + 'genesis.json ' + NODE_DIR + 'boot.key ' + NODE_DIR + 'password; mkdir -p ' + NODE_DIR + 'datadir/keystore ; killall -9 bootnode ; killall -9 geth', function(err, stream) {
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
        conn.exec('nohup geth --datadir "' + NODE_DIR + 'datadir" --networkid 61997 --bootnodes ' + machines[0].bootnode + ' --rpc --rpcport 8545 --rpcaddr ' + machine.ip + ' --rpccorsdomain "*" --rpcapi "eth,net,web3,personal,miner,admin" --allow-insecure-unlock --unlock ' + machine.address + ' --password ' + NODE_DIR + 'password &>/dev/null --gasprice 0 --mine &', function(err) {
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

function initBootnodeOnFirstNode(conn, machine, i) {
    return new Promise(function(resolve, reject) {
        if(i == 0) {
            conn.exec('bootnode --genkey=' + NODE_DIR + 'boot.key', function(err, stream) {
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
        }
        else {
            resolve(true);
        }
    })
}

function genBootnodeEnodeAddr(conn, machine, i) {
    return new Promise(function(resolve, reject) {
        if(i == 0) {
            conn.exec('bootnode --nodekey=' + NODE_DIR + 'boot.key -writeaddress', function(err, stream) {
                if(err) {
                    console.error(err);
                    reject(false);
                }
                else {
                    stream.on('data', function(data) {
                        machines[0]["bootnode"] = 'enode://' + data.toString().replace('\n','') + '@' + machine.ip + ':0?discport=30300';
                        resolve(true); 
                      })
                }
            });
        }
        else {
            resolve(true);
        }
    })
}

function launchBootnodeOnFirstNode(conn, machine, i) {
    return new Promise(function(resolve, reject) {
        if(i == 0) {
            conn.exec('nohup bootnode --nodekey=' + NODE_DIR + 'boot.key -addr ' + machine.ip + ':30300 &>/dev/null &', function(err) {
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
        }
        else {
            resolve(true);
        }
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
                                    sftp.end();
                                    resolve(true);
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

execSync('rm -rf ./ethereum/datadir/*');

createAccountAndGenesis();
setupMachines()
.then(function() {
    fs.writeFileSync("./ip_list.json", JSON.stringify(machines));
    console.log("Machines setup done.")
})
