const execSync = require('child_process').execSync;
const fs = require('fs');
var Client = require('ssh2').Client;

var genesis = require('./ethereum/template_genesis.json');
var machines = require('./ip_list.json');

execSync('rm -rf ./ethereum/datadir/*');

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

machines.forEach(function(machine) {
    var conn = new Client();

    conn.on('keyboard-interactive', function (name, instructions, instructionsLang, prompts, finish, machine) {
            finish(machine.password);
        })
    
    conn.on('ready', function () {
        conn.exec('mkdir -p /home/vagrant/datadir/keystore', function(err, stream) {
            stream.on('data', function(data) {
                console.log('STDOUT: ' + data);      
            }).stderr.on('data', function(data){
                console.log('STDERR: ' + data);      
            }).on('exit', function(code, signal) {
                console.log('Exited with code ' + code + ' and signal: ' + signal);
            });
        });

        conn.sftp(function(err, sftp) {
            var files = fs.readdirSync('./ethereum/datadir/keystore');
            
            sftp.fastPut('./ethereum/datadir/keystore/' + files[machine.id], '/home/vagrant/datadir/keystore/key.json', function(err) {
                if (err) console.log(err);
            });

            sftp.fastPut('./ethereum/genesis.json', '/home/vagrant/genesis.json', function(err) {
                if (err) console.log(err);
                conn.end();
            });
        });

        /*conn.exec('geth --datadir .datadir init genesis.json', function(err, stream) {
            stream.on('data', function(data) {
                console.log('STDOUT: ' + data);      
            }).stderr.on('data', function(data){
                console.log('STDERR: ' + data);      
            }).on('exit', function(code, signal) {
                console.log('Exited with code ' + code + ' and signal: ' + signal);
            });
        });
        
        conn.exec('geth --datadir .datadir --networkid 666 --rpc --ipcpath .datadir/geth.ipc --bootnodes <ADDR>', function(err, stream) {
            stream.on('data', function(data) {
                console.log('STDOUT: ' + data);      
            }).stderr.on('data', function(data){
                console.log('STDERR: ' + data);      
            }).on('exit', function(code, signal) {
                console.log('Exited with code ' + code + ' and signal: ' + signal);
            });
        });*/
    })

    conn.connect({
            host: machine.ip,
            username: machine.user,
            password: machine.password,
            port: 22,
            readyTimeout: 100000
        });
})
