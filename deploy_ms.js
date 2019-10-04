var Deployer = artifacts.require("Deployer");
var Microservice = artifacts.require("Microservice");

var components = {}

//getMicroservicesList
//- returns all choreography tasks from a json-represented BPMN diagram as microservices names
function getMicroservicesList(bpmn) {
    const msList = [];

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
                        resolve([name, addr]);
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
async function generateMicroservices(inst, bpmn) {
    var promises = [];
    var microservices = {};
    let names = getMicroservicesList(bpmn);

    console.log("Creating " + names.length + " microservices ...")
    names.forEach(name => {
        promises.push(setMicroservice(name, inst));
    })

    return await Promise.all(promises)
        .then(ps => {
            ps.forEach(p => {
                if(p)
                    microservices[p[0]] = p[1];
            });
            return microservices;
        })
}

//getBPMNComponents
//- get all BPMN components
function getBPMNComponents(bpmn) {
    bpmn.nodes.forEach(node => {
        components[node.id] = {
            prerequisites: [],
            targets: [],
            himself: node,
            done: false
        }
    })

    bpmn.links.forEach(link => {
        components[link.target].prerequisites.push(link.source);
        components[link.source].targets.push(link.target);
    });
}

//runBPMN
//- resolve the BPMN by launching every microservices tasks
function runBPMN(microservices) {
    runTask("START", microservices);
}

function checkPrerequisites(name) {
    components[name].prerequisites.forEach(p => {
        if(!components[p].done) {
            return false;
        }
    });

    return true;
}

async function runTask(name, microservices) {
    if(!components[name].done) {
        console.log(name);
        while(!checkPrerequisites(name));
        components[name].done = true;
        
        if(components[name].himself.type === "choreographyTask") {
            await runMicroservice(microservices[name]);
        }
    }

    components[name].targets.forEach(t => {
        runTask(t, microservices);
    });
}

async function runMicroservice(addr) {
    try {
        let msInst = await Microservice.at(addr);
        let result = await msInst.runOperations();
    }
    catch(e) {
        console.log(e);
    }
}

//Main 
module.exports = async function() {
    try {
        let inst = await Deployer.deployed();
        let bpmn = require('./choreography.json');
        let microservices = await generateMicroservices(inst, bpmn);
        getBPMNComponents(bpmn);
        runBPMN(microservices);

        setTimeout(() => {console.log(components)}, 5000)
    }
    catch(e) {
        console.log(e)
    }
}

