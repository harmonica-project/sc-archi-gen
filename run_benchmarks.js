var microserviceABI = require('./build/contracts/Microservice.json');
var machines = require('./ip_list.json');
var PromisePool = require('es6-promise-pool')

const Web3 = require('web3');
const YAML = require('yaml');
const fs = require('fs');
const {performance} = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const BENCH_POOL_SPEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).BENCH_POOL_SPEED;
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

var pgBenchTampon = {};
var deploymentErrCount = 0;
var execErrCount = 0;
var opSuccessCount = 0;
var opLaunchCount = 0;
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

//runBenchmark
//- resolve the BPMN by launching every microservices tasks
async function runBenchmark(benchInfo, file, idBench) {
    console.log("New benchmark (" + idBench + ") : " + file)
    var currentElt = benchInfo.nodes[0];

    tStart = performance.now();
    await runStep(currentElt, benchInfo, file, idBench);
    tEnd = performance.now();

    benchmarkDoneCount++;

    csvWriterBench.writeRecords([{
        timestamp: Date.now(),
        benchmark: file,
        time: (tEnd - tStart),
        benchmarkDoneCount: benchmarkDoneCount
    }]);
}

async function runStep(elt, benchInfo, file, idBench) {
    var pArr = [];

    switch(elt.type) {
        case "task":
        case "choreographyTask":
            await runMicroservice(elt.id, elt.payload);

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
                        pArr.push(runStep(getBPMNElt(benchInfo, target), benchInfo, file));
                    }
                }
                else {
                    pArr.push(runStep(getBPMNElt(benchInfo, target), benchInfo, file));
                }
            })

            await Promise.all(pArr).then(result => {
                return true;
            });
            break;

        case "exclusiveGateway":
            var targets = getTargets(benchInfo, elt.id);
            var randomTarget = targets[Math.floor(randomWithSeed()*targets.length)];

            await runStep(getBPMNElt(benchInfo, randomTarget), benchInfo, file).then(result => {
                return true;
            });
            break;

        case "endEvent":
            return true;
            break;

        default:
            getTargets(benchInfo, elt.id).forEach(target => {
                pArr.push(runStep(getBPMNElt(benchInfo, target), benchInfo, file));
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

    csvWriterLoad.writeRecords([load]);

    if(displayInConsole) {
        console.log(str);
        console.log('Deployment errors : ' + deploymentErrCount + ', execution errors : ' + execErrCount);
    }
    setTimeout(monitorLoad, 1000, displayInConsole);
}

function displayProgress(displayInConsole) {
    if(displayInConsole) {
        console.log("Microservices executed: " + opSuccessCount + "\n");
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
async function runMicroservice(name, tasks) {
    //Coefficients of ponderation came from Ethereum OPCODE gas cost sheet
    var machineId = allocateTaskToMachine();

    try {
        console.log('Machine: ' + machineId + ', Name: ' + name)
        opLaunchCount++;

        var msInst = new machines[machineId].provider.eth.Contract(microserviceABI.abi, microserviceABI.networks["61795847"].address);
        let result = await msInst.methods.runOperations(opLaunchCount.toString(), tasks.instructions, tasks.in_bytes_count, tasks.out_bytes_count).send({from: machines[machineId].address});

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
        opSuccessCount++;
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

    var inst = new machines[0].provider.eth.Contract(microserviceABI.abi, microserviceABI.networks["61795847"].address);

    if(inst) {
        var files = fs.readdirSync('./graphs');
          
        displayProgress(false);
        monitorLoad(false);

        var idBench = 0;

        //benchmark promise generator
        var promiseProducer = function () {
            idBench++;
            bpmnId = Math.floor(randomWithSeed()*files.length);
            file = files[bpmnId];
            benchInfo = require('./graphs/' + file);
            console.log('Running benchmark ' + file + '...');
            return runBenchmark(benchInfo, file, idBench);
        }

        var pool = new PromisePool(promiseProducer, BENCH_POOL_SPEED);
    
        // Start the pool.
        var poolPromise = pool.start();
        
        // Wait for the pool to settle.
        await poolPromise;
    }
    else {
        console.error("Can't deploy microservices: provider not working.")
    }
}

run();