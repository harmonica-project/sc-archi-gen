var Deployer = artifacts.require("Deployer");

var microservices = [];

//getMicroservicesList
//- returns all choreography tasks from a json-represented BPMN diagram as microservices names
function getMicroservicesList() {
    const msList = [];

    const bpmn = require('./choreography.json');
    bpmn.nodes.forEach(node => {
        if(node.type == "choreographyTask") msList.push(node.id);
    })

    return msList;
}

//generateMicroservices
//- deploy a smart-contract microservice and store its address
function setMicroservice(name, inst) {
    return new Promise((resolve, reject) => {
        var p = inst.set_microservice(name, 10, 10, 10);
        p.then(res => {
            if(res.tx) {
                var q = inst.get_microservice_address(name);
                q.then(addr => {
                    if(addr) {
                        microservices.push({
                            name: name,
                            address: addr
                        })
                        resolve(true);
                    }
                    else {
                        reject(false);
                    }
                })
            }
            else {
                console.log("Failed to create contract " + name);
                reject(false);
            }
        });
    })
}

//generateMicroservices
//- deploy smart-contracts microservices from microservice name list
function generateMicroservices(inst, names) {
    var promises = [];

    console.log("Creating " + names.length + " microservices ...")
    names.forEach(name => {
        promises.push(setMicroservice(name, inst));
    })

    Promise.all(promises).then(() => {
        console.log(microservices);
    })
}

//Main 
module.exports = async function() {
    let inst = await Deployer.deployed();
    let names = getMicroservicesList();
    generateMicroservices(inst, names);
}

