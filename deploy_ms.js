var Deployer = artifacts.require("Deployer");

const NB_MS = 10;

module.exports = async function() {
    var microservices = [];
    
    try {
        let inst = Deployer.deployed()

        for(var i = 1; i <= NB_MS; i++) {

        }
    }
    catch(e) {
        console.log(e);
    }
}