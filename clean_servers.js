const execSync = require('child_process').execSync;
const fs = require('fs');
const YAML = require('yaml');

var Client = require('ssh2').Client;
var machines = require('./ip_list.json');

const SSH_KEY = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).SSH_KEY;
const NODE_DIR = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).NODE_WORKING_DIR;

async function setupMachines() {
    for(var i = 0; i < machines.length; i++) {
        await setupMachine(machines[i], i);
    }
}

function setupMachine(machine, i) {
    return new Promise(function (resolve, reject) {
        console.log("Machine " + machine.ip + " down ...")
        var conn = new Client();

        conn.on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish, machine) {
            finish(machine.password);
        })
        
        conn.on('ready', async function () {
            await cleanMachine(conn, machine);

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

function cleanMachine(conn, machine) {
    return new Promise(function(resolve, reject) {
        conn.exec('sudo rm -rf ' + NODE_DIR + '* ; pkill -9 geth; sudo rm /var/log/geth.log;', function(err, stream) {
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

////////////////////////////////////////

execSync('rm -rf ./ethereum/datadir/* ; mkdir ./ethereum/datadir/nodekeys');

setupMachines()
.then(function() {
    console.log("Machines down.")
})
