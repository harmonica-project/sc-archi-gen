var machines = require('./ip_list.json');

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
        {id: 'success', title: 'SUCCESS'},
        {id: 'time', title: 'TIME'},
        {id: 'benchmarkDoneCount', title: 'BENCHMARK_DONE_COUNT'},
        {id: 'benchmarkErrorCount', title: 'BENCHMARK_ERROR_COUNT'}
    ]
});

const csvWriterLoad = createCsvWriter({
    path: './results/load/res_' + Date.now() + '.csv',
    header: generateLoadHeader()
});

var opSuccessCount = 0;
var opLaunchCount = 0;
var benchmarkDoneCount = 0;
var benchmarkErrorCount = 0;
var benchmarkContractFN = process.argv[2];
var benchmarkDuration = process.argv[3];
var idBench = 0;

//tlog
//- display a console.log string with time since the program started
function tlog(str) {
    console.log('[' + performance.now() + '] ' + String(str));
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
        tlog(str);
    }
    setTimeout(monitorLoad, 2000, displayInConsole);
}

//displayProgress
//- display a counter of operations performed since the beginning
function displayProgress(displayInConsole) {
    if(displayInConsole) {
        console.log('\n-----------------');
        tlog("Tasks launched: " + opLaunchCount);
        tlog("Tasks successfully finished: " + opSuccessCount);
        tlog("Benchmarks done: " + benchmarkDoneCount);
        tlog("Benchmarks failed: " + benchmarkErrorCount);
        setTimeout(displayProgress, 2000, displayInConsole);
        console.log('-----------------\n');
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

//runWorkflow
//- read a json file containing benchmark instructions, deploys linked smart-contract then perform each function at once
async function runWorkflow(idBench) {
    var execResult = true;
    var startTime = performance.now();
    var machineId = allocateTaskToMachine();
    var scWorkflow = require("./contracts/" + benchmarkContractFN.split('.').slice(0, -1).join('.') + ".json")

    try {
        var contract = await deployContract(machineId, scWorkflow[0]);
    }
    catch(e) {
        execResult = false;
    }

    if(execResult) {
        for(var i = 1; i < scWorkflow.length; i++) {
            opLaunchCount++;
    
            try {
                var parameters = resolveParameters(scWorkflow[i].parameters, machineId);
                var execResult = await contract.methods[scWorkflow[i].name](...parameters)[scWorkflow[i].type]({from: machines[machineId].address, gas: '0x346DC5D638', gasPrice: '0x0'});
            
                if(!execResult.transactionHash) {
                    break;
                }
                else {
                    opSuccessCount++;
                }
            }
            catch(e) {
                execResult = false;
            }
        }
    }

    var endTime = performance.now();

    if(execResult) {
        benchmarkDoneCount++;

        csvWriterBench.writeRecords([{
            timestamp: Date.now(),
            benchmark: idBench,
            success: true,
            time: (endTime - startTime),
            benchmarkDoneCount: benchmarkDoneCount,
            benchmarkErrorCount: benchmarkErrorCount
        }])
    }
    else {
        benchmarkErrorCount++;

        csvWriterBench.writeRecords([{
            timestamp: Date.now(),
            benchmark: idBench,
            success: false,
            time: (endTime - startTime),
            benchmarkDoneCount: benchmarkDoneCount,
            benchmarkErrorCount: benchmarkErrorCount
        }])
    }
}

//deployContract
//- deploys a smart-contract
async function deployContract(machineId, constructorDef) {
    // Compile the source code
    const input = {
        language: 'Solidity',
        sources: {},
        settings: {
            outputSelection: {
                '*': {
                    '*': [ "*" ]
                }
            }
        }
    }; 

    input.sources[benchmarkContractFN] = {content: fs.readFileSync('./contracts/' + benchmarkContractFN, "UTF-8")};

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    const bytecode = output.contracts[benchmarkContractFN][benchmarkContractFN.split('.').slice(0, -1).join('.')].evm.bytecode.object;
    const abi = output.contracts[benchmarkContractFN][benchmarkContractFN.split('.').slice(0, -1).join('.')].abi;
    const parameters = resolveParameters(constructorDef.parameters, machineId);
    
    //Deploy the contract and return instance
    var contract = await new machines[machineId]["provider"].eth.Contract(abi)
		.deploy({
			data: '0x' + bytecode,
			arguments: parameters
        })
		.send({
			from: machines[machineId].address,
            gas: '0x346DC5D638',
            gasPrice: '0x0'
        })

    return contract;
}

//resolveParameters
//- takes workflow parameters and change them dynamically with new benchmark informations if needed
function resolveParameters(params, machineId) {
    for(var i = 0; i < params.length; i++) {
        switch(params[i]) {
            case 'SENDER':
                params[i] = machines[machineId].address;
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

//runWorkflowWave
//- Run a certain amount of transaction per second
function runWorkflowWave(bmStartTime) {
    if(performance.now() - bmStartTime > benchmarkDuration*1000) {
        process.exit(0);
    }

    for(var i = 0; i< BENCH_POOL_SPEED; i++) {
        idBench++;
        runWorkflow(idBench);
    }

    setTimeout(runWorkflowWave, 1000, bmStartTime);
}

//Main function
async function run() {
    createProvidersFromMachines();
    createResultRepIfNotDefined();
    displayProgress(true);
    monitorLoad(false);
        
    var benchmarkStartTime = performance.now();
    runWorkflowWave(benchmarkStartTime)
}

run();