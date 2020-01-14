var fs = require('fs');

var nbNodes = parseInt(process.argv.slice(2));
var ipList = [];
var sShell = "";

for(var i = 1; i <= nbNodes; i++) {
    ipList.push({
        ip: '10.0.0.' + (i*10 + 1),
        user: 'vagrant'
    });

    sShell += "ssh-keygen -R 10.0.0." + (i*10 + 1) + "\n";
}

fs.writeFileSync("../ip_list.json", JSON.stringify(ipList));
fs.writeFileSync("../reset_ssh_keys.sh", sShell);