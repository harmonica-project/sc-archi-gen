var Deployer = artifacts.require("Deployer");
var Microservice = artifacts.require("Microservice");
const {performance} = require('perf_hooks');

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
async function runBPMN(microservices) {
    var tStart = performance.now();
    await runTask("START", microservices);
    var tEnd = performance.now();
    console.log("BPMN resolution took " + (tEnd - tStart) + " ms.")
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
    return new Promise(async function(resolve) {
        if(!components[name].done) {
            while(!checkPrerequisites(name));
            components[name].done = true;
    
            if(components[name].himself.type === "choreographyTask") {
                var tStart = performance.now();
                await runMicroservice(microservices[name]);
                var tEnd = performance.now();
                console.log("Microservice " + name + " call took " + (tEnd - tStart) + " ms.")
            }
        }
    
        var nextTasks = [];
    
        components[name].targets.forEach(t => {
            nextTasks.push(runTask(t, microservices));
        });
    
        Promise.all(nextTasks).then(function() {
            resolve(true);
        });
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
    }
    catch(e) {
        console.log(e)
    }
}

