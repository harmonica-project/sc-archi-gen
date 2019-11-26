var deployerABI = require('./build/contracts/Deployer.json');
var microserviceABI = require('./build/contracts/Microservice.json');
var machines = require('./ip_list.json');
var PromisePool = require('es6-promise-pool')

const Web3 = require('web3');
const YAML = require('yaml');
const fs = require('fs');
const {performance} = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const BENCH_POOL_SPEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).BENCH_POOL_SPEED;
const DEPLOYMENT_POOL_SPEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).DEPLOYMENT_POOL_SPEED;
const SEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).SEED;
var seed = SEED;

const csvWriterBench = createCsvWriter({
    path: './results/bench/res_' + Date.now() + '.csv',
    header: [
        {id: 'timestamp', title: 'TIMESTAMP'},
        {id: 'benchmark', title: 'BENCHMARK'},
        {id: 'time', title: 'TIME'},
        {id: 'benchmarkDoneCount', title: 'BENCHMARK_DONE_COUNT'},
    ]
});

const csvWriterLoad = createCsvWriter({
    path: './results/load/res_' + Date.now() + '.csv',
    header: generateLoadHeader()
});

var benchResults = [];
var loadResults = [];
var pgBenchTampon = {};
var deploymentErrCount = 0;
var execErrCount = 0;
var opDoneCount = 0;
var benchmarkDoneCount = 0;

//randomWithSeed
//- generates pseudo random numbers from an initial seed
function randomWithSeed() {
    seed++;
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

//generateLoadHeader
//- generate a header for saved CSV load files
function generateLoadHeader() {
    var header = [{id: 'timestamp', title: 'TIMESTAMP'}];

    for(var i = 0; i < machines.length; i++) {
        header.push({
            id: 'load_' + machines[i].ip, title: 'LOAD_' + machines[i].ip,
        })
    }

    return header;
}

//getMicroservicesList
//- returns all choreography tasks from a json-represented BPMN diagram as microservices names
function getMicroservicesList(bench_file) {
    const msList = [];

    for (let [key, node] of Object.entries(bench_file.nodes)) {
        if(node.type == "choreographyTask" || node.type == "task") msList.push(node.id);
    }

    return msList;
}

//setMicroservice
//- deploy a smart-contract microservice and store its address
function setMicroservice(name, inst) {
    return new Promise((resolve) => {
        try {
            inst.methods.set_microservice(name).send({from: machines[0].address},(error, addr) => {
                if (!error) {
                    inst.methods.get_microservice_address(name).call({from: machines[0].address},(error, addr) => {
                        if (!error) {
                            resolve([name, addr]);
                        } else {
                            console.error(error);
                            resolve(false);
                        }
                    })
                } else {
                    console.error('Microservice ' + name + ' deployment failed: ' + error);
                    deploymentErrCount++;
                    resolve(false);
                }
            })
        }
        catch(e) {
            console.error('Microservice ' + name + ' deployment failed: ' + e);
            deploymentErrCount++;
            resolve(false);
        }
    })
}

//generateMicroservices
//- deploy smart-contracts microservices from microservice name list
async function generateMicroservices(inst, bench_file, idBench) {
    var promises = [];
    var microservices = {};
    let names = getMicroservicesList(bench_file);

    //console.log("Creating " + names.length + " microservices ...")
    names.forEach(name => {
        promises.push(setMicroservice(name, inst));
    })

    return await Promise.all(promises)
        .then(ps => {
            ps.forEach(p => {
                if(p)
                    microservices[p[0]] = p[1];
            });
            return [microservices, idBench];
        })
}

//runBenchmark
//- resolve the BPMN by launching every microservices tasks
async function runBenchmark(microservices, benchInfo, file, idBench) {
    console.log("New benchmark (" + idBench + ") : " + file)
    var currentElt = benchInfo.nodes[0];

    tStart = performance.now();
    await runStep(currentElt, microservices, benchInfo, file, idBench);
    tEnd = performance.now();

    benchmarkDoneCount++;

    benchResults.push({
        timestamp: Date.now(),
        benchmark: file,
        time: (tEnd - tStart),
        benchmarkDoneCount: benchmarkDoneCount
    });
}

async function runStep(elt, microservices, benchInfo, file, idBench) {
    var pArr = [];

    switch(elt.type) {
        case "task":
        case "choreographyTask":
            await runMicroservice(elt.id, microservices[elt.id], elt.payload, file);

            getTargets(benchInfo, elt.id).forEach(target => {
                if(getBPMNElt(benchInfo, target).type == "parallelGateway") {
                    if(!pgBenchTampon[idBench + target]) pgBenchTampon[idBench + target] = [];
                    pgBenchTampon[idBench + target].push(elt.id);

                    var pgTampon = pgBenchTampon[idBench + target];
                    var sources = getSources(benchInfo, target);
                    pgTampon.sort()
                    sources.sort()

                    if(JSON.stringify(pgTampon) == JSON.stringify(sources)) {
                        delete pgBenchTampon[idBench + target];
                        pArr.push(runStep(getBPMNElt(benchInfo, target), microservices, benchInfo, file));
                    }
                }
                else {
                    pArr.push(runStep(getBPMNElt(benchInfo, target), microservices, benchInfo, file));
                }
            })

            await Promise.all(pArr).then(result => {
                return true;
            });
            break;

        case "exclusiveGateway":
            var targets = getTargets(benchInfo, elt.id);
            var randomTarget = targets[Math.floor(randomWithSeed()*targets.length)];

            await runStep(getBPMNElt(benchInfo, randomTarget), microservices, benchInfo, file).then(result => {
                return true;
            });
            break;

        case "endEvent":
            return true;
            break;

        default:
            getTargets(benchInfo, elt.id).forEach(target => {
                pArr.push(runStep(getBPMNElt(benchInfo, target), microservices, benchInfo, file));
            })

            await Promise.all(pArr).then(result => {
                return true;
            });
            break;
    }
}

//allocateTaskToMachine
//- get the least used machine, then allocates it a task
function allocateTaskToMachine() {
    var leastUsedMachine = 0;

    for(var i = 0; i < machines.length; i++) {
        if(machines[i].load == 0) {
            machines[i].load += 1;
            return i;
        }

        if(machines[i].load < machines[leastUsedMachine].load) leastUsedMachine = i;
    }

    machines[leastUsedMachine].load += 1;
    return leastUsedMachine;
}

//monitorLoad
//- keep track of machines load, if displayInConsole = true display it inside the console too
function monitorLoad(displayInConsole) {
    var str = "Operation load by node:\n";
    var load = {timestamp: Date.now()};

    machines.forEach(machine => {
        str += machine.ip + ' => ' + machine.load + '\n';
        load["load_" + machine.ip] = machine.load;
    })

    loadResults.push(load);

    if(displayInConsole) console.log(str);
    setTimeout(monitorLoad, 1000, displayInConsole);
}

function displayProgress(displayInConsole) {
    if(displayInConsole) {
        console.log("Microservices executed: " + opDoneCount + "\n");
        setTimeout(displayProgress, 1000);
    }
}

function getSources(bench, eltId) {
    var sources = [];

    bench.links.forEach(link => {
        if(link.target == eltId) 
            sources.push(link.source)
    })

    return sources;
}

function getTargets(bench, eltId) {
    var targets = [];

    bench.links.forEach(link => {
        if(link.source == eltId) 
            targets.push(link.target)
    })

    return targets;
}

function getBPMNElt(bench, eltId) {
    for(var i = 0; i < bench.nodes.length; i++) {
        var node = bench.nodes[i];
        if(String(node.id) == String(eltId)) return node;
    }   

    return false;
}

//runMicroservice
//- execute dummy tasks inside a microservice and monitor required time to execution
async function runMicroservice(name, addr, tasks, file) {
    //Coefficients of ponderation came from Ethereum OPCODE gas cost sheet
    var machineId = allocateTaskToMachine();

    try {
        var msInst = new machines[machineId].provider.eth.Contract(microserviceABI.abi, addr);
        let result = await msInst.methods.runOperations(tasks.instructions, tasks.in_bytes_count, tasks.out_bytes_count).send({from: machines[machineId].address});

        if(!result.transactionHash) {
            console.error('Error : Microservice ' + name + ' transaction failed.');
            execErrCount++;
        }
    }
    catch(e) {
        console.error('Error while running microservice ' + name + ': ' + e);
        execErrCount++;
    }
    finally {
        machines[machineId].load -= 1;
        opDoneCount++;
    }
}

//createProvidersFromMachines
//- creates a web3 provider for every node, in order to send it transactions
function createProvidersFromMachines() {
    for(var i = 0; i < machines.length; i++) {
        machines[i]["provider"] = new Web3('http://' + machines[i].ip + ':8545');
        machines[i]["load"] = 0;
        machines[i].provider.eth.defaultAccount = machines[i].address;
    }
}

//createResultRepIfNotDefined
function createResultRepIfNotDefined() {
    var dir="results";
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }

    var dir="results/bench";
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }

    var dir="results/load";
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir);
    }
}

//Main function
async function run() {
    createProvidersFromMachines();
    createResultRepIfNotDefined();

    var inst = new machines[0].provider.eth.Contract(deployerABI.abi, deployerABI.networks["61997"].address);

    if(inst) {
        var files = fs.readdirSync('./graphs');
        var graphs = [];
    
        var idDeployedMS = -1;
    
        //microservices deployer promise generator
        var promiseProducer = function () {
            idDeployedMS++;
            if(idDeployedMS < files.length) {
                file = files[idDeployedMS];
                benchInfo = require('./graphs/' + file);
                console.log('Generating microservices for ' + file + '...');
                return generateMicroservices(inst, benchInfo, idDeployedMS);
            }
            else return null;
        }
        var pool = new PromisePool(promiseProducer, DEPLOYMENT_POOL_SPEED)

        var poolPromise = pool.start()

        pool.addEventListener('fulfilled', function (event) {
            file = files[event.data.result[1]];
            benchInfo = require('./graphs/' + file);
            graphs[event.data.result[1]] = {msList: event.data.result[0], benchInfo: benchInfo};
          })
          
        await poolPromise.then(async () => {
            displayProgress(false);
            monitorLoad(false);
    
            var idBench = 0;

            //benchmark promise generator
            var promiseProducer = function () {
                idBench++;
                bpmnId = Math.floor(randomWithSeed()*files.length);
                file = files[bpmnId];
                console.log('Running benchmark ' + file + '...');
                return runBenchmark(graphs[bpmnId].msList, graphs[bpmnId].benchInfo, file, idBench);
            }
    
            var pool = new PromisePool(promiseProducer, BENCH_POOL_SPEED);
     
            // Start the pool.
            var poolPromise = pool.start();
            
            // Wait for the pool to settle.
            await poolPromise.then(() => {
                csvWriterBench.writeRecords(benchResults)       // returns a promise
                .then(() => {
                    csvWriterLoad.writeRecords(loadResults)       // returns a promise
                        .then(() => {
                            console.log('Benchmark completed and results stored. Deployment errors: ' + deploymentErrCount + ', execution errors: ' + execErrCount + '.');
                            process.exit(0);
                        });
                });
            })
        })
    }
    else {
        console.error("Can't deploy microservices: provider not working.")
    }
}

run();