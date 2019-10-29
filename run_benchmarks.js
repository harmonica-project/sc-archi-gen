var deployerABI = require('./build/contracts/Deployer.json');
var microserviceABI = require('./build/contracts/Microservice.json');
var machines = require('./ip_list.json');

const Web3 = require('web3')

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
        inst.methods.set_microservice(name).send({from: machines[0].address},(error, addr) => {
            if (!error) {
                inst.methods.get_microservice_address(name).call({from: machines[0].address},(error, addr) => {
                    if (!error) {
                        resolve([name, addr])
                    } else {
                        reject(error);
                    }
                })
            } else {
                reject(error);
            }
        })
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

function allocateTaskToMachine(difficulty) {
    var leastUsedMachine = 0;

    for(var i = 0; i < machines.length; i++) {
        if(machines[i].load == 0) {
            machines[i].load += difficulty;
            return i;
        }

        if(machines[i].load < machines[leastUsedMachine].load) leastUsedMachine = i;
    }

    machines[leastUsedMachine].load += difficulty;
    return leastUsedMachine;
}

function displayLoad() {
    var str = "";

    machines.forEach(machine => {
        str += machine.ip + ' => ' + machine.load + '\n';
    })

    return str;
}

//runMicroservice
//- execute dummy tasks inside a microservice and monitor required time to execution
async function runMicroservice(name, addr, tasks) {
    //console.log(displayLoad())
    var difficulty = tasks.instructions + tasks.in_bytes_count + tasks.out_bytes_count;
    var machineId = allocateTaskToMachine(difficulty);
    var msInst = new machines[machineId].provider.eth.Contract(microserviceABI.abi, addr);

    var tStart = performance.now();
    let result = await msInst.methods.runOperations(tasks.instructions, tasks.in_bytes_count, tasks.out_bytes_count).send({from: machines[machineId].address});
    var tEnd = performance.now();

    machines[machineId].load -= difficulty;

    if(!result.transactionHash) 
        console.log('- Microservice ' + name + ' failed to run.')
    else 
        console.log("- Microservice " + name + " call took " + (tEnd - tStart) + " ms.")
}

function createProvidersFromMachines() {
    for(var i = 0; i < machines.length; i++) {
        machines[i]["provider"] = new Web3('http://' + machines[i].ip + ':8545');
        machines[i]["load"] = 0;
        machines[i].provider.eth.defaultAccount = machines[i].address;
    }
}

async function run() {
    createProvidersFromMachines();

    var inst = new machines[0].provider.eth.Contract(deployerABI.abi, deployerABI.networks["61997"].address);

    if(inst) {
        var files = fs.readdirSync('./benchmarks');

        for(var i = 0; i < files.length; i++) {
            file = files[i];
            benchInfo = require('./benchmarks/' + file);
            const microservicesList = await generateMicroservices(inst, benchInfo);
            console.log('Running benchmark ' + file + '...');
            await runBenchmarks(microservicesList, benchInfo);
        }
    }
    else {
        console.error("Can't deploy microservices: provider not working.")
    }
}

run()