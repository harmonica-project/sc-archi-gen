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