var fs = require('fs');

var nbNodes = parseInt(process.argv.slice(2));
var ipList = []

for(var i = 1; i <= nbNodes; i++) {
    ipList.push({
        ip: '10.0.0.' + (i + 10),
        user: 'vagrant',
        password: 'vagrant'
    })
}

fs.writeFileSync("../ip_list.json", JSON.stringify(ipList));

var truffleConfig = {
    networks: {
        infra: {
            host: "10.0.0.11",     
            port: 8545,            
            network_id: 61997,       
            gasLimit: "0x346DC5D638865",
            gasPrice: "0x0",
            },
        },
  
        compilers: {
            solc: {
                version: "0.5.0"
            }
        }
    }

    fs.writeFileSync("../truffle-config.js", 'module.exports = ' + JSON.stringify(truffleConfig));