const execSync = require('child_process').execSync;
const fs = require('fs');
var Client = require('ssh2').Client;

var genesis = require('./ethereum/template_genesis.json');
var machines = require('./ip_list.json');

async function setupMachines() {
    for(var i = 0; i < machines.length; i++) {
        await setupMachine(machines[i], i);
    }
    console.log(machines)
}

function createAccountAndGenesis() {
    for(var i = 0; i < machines.length; i++) {
        console.log("Creating key " + i + " ...")
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
            await unlockAndBindAccount(conn, machine, i);

            conn.end();
            resolve(true);
        })
    
        conn.connect({
                host: machine.ip,
                username: machine.user,
                port: 22,
                readyTimeout: 100000,
                privateKey: require('fs').readFileSync('/root/.ssh/id_rsa')
        });
    });
}

function setupDirectory(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.exec('rm -rf /home/vagrant/datadir /home/vagrant/genesis.json /home/vagrant/boot.key ; mkdir -p /home/vagrant/datadir/keystore ; killall -9 bootnode ; killall -9 geth', function(err, stream) {
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
        conn.exec('geth --datadir /home/vagrant/datadir init /home/vagrant/genesis.json', function(err, stream) {
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
    console.log('Launching node on '  + machine.ip)
    return new Promise(function(resolve, reject) {
        conn.exec('nohup geth --datadir "/home/vagrant/datadir" --networkid 666 --bootnodes ' + machines[0].bootnode + ' --rpc --rpcport 8545 --rpcaddr ' + machine.ip + ' --rpccorsdomain "*" --rpcapi "eth,net,web3,personal,miner,admin" --allow-insecure-unlock --mine --miner.threads 10 &>/dev/null &', function(err) {
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
            conn.exec('bootnode --genkey=/home/vagrant/boot.key', function(err, stream) {
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
            conn.exec('bootnode --nodekey=/home/vagrant/boot.key -writeaddress', function(err, stream) {
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
            conn.exec('nohup bootnode --nodekey=/home/vagrant/boot.key -addr ' + machine.ip + ':30300 &>/dev/null &', function(err) {
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
            
            sftp.fastPut('./ethereum/datadir/keystore/' + files[i], '/home/vagrant/datadir/keystore/key.json', function(err) {
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

function unlockAndBindAccount(conn, machine, i) {
    return new Promise(function(resolve, reject) {
        conn.exec('geth --exec "personal.listAccounts" attach http://' + machine.ip + ':8545', function(err, stream) {
                if(err) {
                    console.error(err);
                    reject(false);
                }
                else {
                    stream.on('data', function(data) {
                        machines[i]["address"] = JSON.parse(data.toString().replace('\n', ''))[0];
                        conn.exec('geth --exec "personal.unlockAccount(\'' + machines[i]["address"] + '\', \'password\', 999999)" attach http://' + machine.ip + ':8545', function(err, stream) {
                            if(err) {
                                console.error(err);
                                reject(false);
                            }
                            else {
                                resolve(true); 
                            }
                        });
                    })
                }
            });
    })
}

////////////////////////////////////////

execSync('rm -rf ./ethereum/datadir/*');

createAccountAndGenesis();
setupMachines()
.then(function() {
    console.log("Machines setup done.")
})
