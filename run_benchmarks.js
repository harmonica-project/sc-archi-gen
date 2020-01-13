var machines = require('./ip_list.json');
var PromisePool = require('es6-promise-pool')

const Web3 = require('web3');
const solc = require('solc');
const YAML = require('yaml');
const fs = require('fs');
const {performance} = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const BENCH_POOL_SPEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).BENCH_POOL_SPEED;

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

var deploymentErrCount = 0;
var execErrCount = 0;
var opSuccessCount = 0;
var opLaunchCount = 0;
var benchmarkDoneCount = 0;
var benchmarkContract = process.argv[2];
var benchmarkDuration = process.argv[3];

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

//createProvidersFromMachines
//- creates a web3 provider for every node, in order to send it transactions
function createProvidersFromMachines() {
    for(var i = 0; i < machines.length; i++) {
        machines[i]["provider"] = new Web3('http://' + machines[i].ip + ':8545');
        machines[i]["load"] = 0;
        machines[i].provider.eth.defaultAccount = machines[i].address;
    }
}

async function runWorkflow(idBench) {
    var startTime = performance.now();
    var machineId = allocateTaskToMachine();
    var scWorkflow = require("./contracts/" + benchmarkContract.split('.').slice(0, -1).join('.') + ".json")

    var contract = await deployContract(machineId, scWorkflow[0]);

    console.log(contract)

    for(var i = 1; i < scWorkflow.length; i++) {
        var parameters = resolveParameters(scWorkflow[i].parameters)

        
    }

    var endTime = performance.now();
    benchmarkDoneCount++;

    csvWriterBench.writeRecords([{
        timestamp: Date.now(),
        benchmark: idBench,
        time: (endTime - startTime),
        benchmarkDoneCount: benchmarkDoneCount
    }])
}

async function deployContract(machineId, constructorDef) {
    // Compile the source code
    const input = fs.readFileSync('./contracts/' + benchmarkContract);
    const output = solc.compile(input.toString(), 1);
    const bytecode = output.contracts[Object.keys(output.contracts)[0]].bytecode;
    const abi = JSON.parse(output.contracts[Object.keys(output.contracts)[0]].interface);
    const parameters = resolveParameters(constructorDef.parameters, machineId);

    //Deploy the contract and return instance
    const deployedContract = await new machines[machineId]["provider"].eth.Contract(abi)
		.deploy({
			data: '0x' + bytecode,
			arguments: parameters
		})
		.send({
			from: machines[machineId].address
		});

        console.log(deployedContract);
        return deployedContract;
}

function resolveParameters(params, machineId) {
    for(var i = 0; i < params.length; i++) {
        switch(params[i]) {
            case 'SENDER':
                params[i] = machines[machineId].length;
                break;
        }
    }

    return params;
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
    displayProgress(false);
    monitorLoad(false);

    var idBench = 0;
    var benchmarkStart = performance.now();

    //benchmark promise generator
    var promiseProducer = function () {
        var benchmarkNow = performance.now();
        if (benchmarkNow - duration*1000 > benchmarkStart && benchmarkDuration != 0) 
            return null;

        idBench++;
        console.log('Running benchmark number ' + idBench + '...');
        return runWorkflow(idBench);
    }

    var pool = new PromisePool(promiseProducer, BENCH_POOL_SPEED);

    // Start the pool.
    var poolPromise = pool.start();
    
    // Wait for the pool to settle.
    await poolPromise;
}

run();