var Deployer = artifacts.require("Deployer");
var Microservice = artifacts.require("Microservice");
var fs = require('fs');

const {performance} = require('perf_hooks');

//getMicroservicesList
//- returns all choreography tasks from a json-represented BPMN diagram as microservices names
function getMicroservicesList(bench_file) {
    const msList = [];

    for (let [key, node] of Object.entries(bench_file.components)) {
        if(node.himself.type == "choreographyTask") msList.push(node.himself.id);
    }

    return msList;
}

//generateMicroservices
//- deploy a smart-contract microservice and store its address
function setMicroservice(name, inst) {
    return new Promise((resolve, reject) => {
        var p = inst.set_microservice(name);
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
async function generateMicroservices(inst, bench_file) {
    var promises = [];
    var microservices = {};
    let names = getMicroservicesList(bench_file);

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

//runBPMN
//- resolve the BPMN by launching every microservices tasks
async function runBenchmarks(microservices, benchInfo) {
    var paths = benchInfo.paths;
    var components = benchInfo.components;

    for(var i = 0; i < paths.length; i++) {
        var path = paths[i];
        var tStart = performance.now();
        
        for(j = 0; j < path.length; j++) {
            var steps = path[j];
            var awaitMs = [];

            steps.forEach(step => {
                if(components[step].himself.type === "choreographyTask") {
                    var name = components[step].himself.id;
                    awaitMs.push(runMicroservice(name, microservices[name], components[step].himself.payload));
                }
            })
            
            await Promise.all(awaitMs);
        }

        var tEnd = performance.now();

        console.log("=> Path resolution took " + (tEnd - tStart) + " ms.\n")
    }
}

//runMicroservice
//- execute dummy tasks inside a microservice and monitor required time to execution
async function runMicroservice(name, addr, tasks) {
    var tStart = performance.now();
    let msInst = await Microservice.at(addr);
    let result = await msInst.runOperations(tasks.instructions, tasks.in_bytes_count, tasks.out_bytes_count);
    var tEnd = performance.now();

    if(!result.tx) 
        console.log('- Microservice ' + name + ' failed to run.')
    else 
        console.log("- Microservice " + name + " call took " + (tEnd - tStart) + " ms.")
}

//Main 
module.exports = async function() {
    let inst = await Deployer.deployed();
    var files = fs.readdirSync('./benchmarks');

    for(var i = 0; i < files.length; i++) {
        file = files[i];
        benchInfo = require('./benchmarks/' + file);
        const deployedMSList = await generateMicroservices(inst, benchInfo);
        console.log('Running benchmark ' + file + '...');
        await runBenchmarks(deployedMSList, benchInfo);
    }
}

