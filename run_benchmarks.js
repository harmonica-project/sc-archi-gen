var machines = require('./ip_list.json');

const Web3 = require('web3');
const solc = require('solc');
const YAML = require('yaml');
const fs = require('fs');
const Tx = require('ethereumjs-tx').Transaction
const Common = require('ethereumjs-common').default;
const {performance} = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const BENCH_POOL_SPEED = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).BENCH_POOL_SPEED;
const NB_ACCOUNTS = YAML.parse(fs.readFileSync('./hyperparams.yml', 'utf8')).NB_ACCOUNTS;
const VERBOSE = true;
const INSTANT_STOP = false;

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
var benchmarkLaunchedCount = 0;
var benchmarkDoneCount = 0;
var benchmarkErrorCount = 0;
var benchmarkStartTime = 0;
var benchmarkContractFN = process.argv[2];
var benchmarkDuration = process.argv[3];
var sharedBenchRes = [];
var contractCode = buildContract();
var accounts = [];
var idBench = 0;
var seed = 0;
var displayFinishMessage = true;

//randomWithSeed
//- generates pseudo random numbers from an initial seed
function randomWithSeed() {
    seed++;
    var x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

//tlog
//- display a console.log string with time since the program started
function tlog(str) {
    console.log('[' + (performance.now() - benchmarkStartTime) + '] ' + String(str));
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

async function setAccounts(nb) {
    for(var i = 0; i < nb; i++) {
        var account = await machines[0].provider.eth.accounts.create();
        account["nonce"] = 0;
        accounts.push(account);
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
//- store load res into a CSV file for monitoring
async function writeLoadRes() {
    var load = {timestamp: Date.now()};

    machines.forEach(machine => {
        load["load_" + machine.ip] = machine.load;
    })

    csvWriterLoad.writeRecords([load]);

    setTimeout(writeLoadRes, 1000);
}

//writeBenchRes
//- store bench res into a CSV file for monitoring
async function writeBenchRes() {
    csvWriterBench.writeRecords(sharedBenchRes);
    sharedBenchRes = [];

    setTimeout(writeBenchRes, 1000);
}

//displayProgress
//- display a counter of operations performed since the beginning
async function displayProgress(displayInConsole) {
    if(displayInConsole) {
        console.log('\n-----------------');
        tlog("Tasks launched: " + opLaunchCount);
        tlog("Tasks successfully finished: " + opSuccessCount);
        tlog("Benchmarks functions launched: " + benchmarkLaunchedCount);
        tlog("Benchmarks functions done: " + benchmarkDoneCount);
        tlog("Benchmarks functions failed: " + benchmarkErrorCount);
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
    benchmarkLaunchedCount++;
    var execResult = true;
    var startTime = performance.now();
    var machineId = allocateTaskToMachine();
    var accountId = Math.floor(randomWithSeed() * NB_ACCOUNTS);
    var scWorkflow = require("./contracts/" + benchmarkContractFN.split('.').slice(0, -1).join('.') + ".json")

    try {
        var contractReceipt = await deployContract(machineId, accountId, scWorkflow[0]);
    }
    catch(e) {
        execResult = false;
        if (VERBOSE) tlog(e);
    }

    if(execResult) {
        for(var i = 1; i < scWorkflow.length; i++) {
            opLaunchCount++;
    
            try {
                if(scWorkflow[i].type == 'send') {
                    var execResult = await callContract(machineId, accountId, scWorkflow[i], contractReceipt.contractAddress);
                }
                else {
                    var parameters = resolveParameters(scWorkflow[i].parameters, machineId);
                    var contract = await new machines[machineId]["provider"].eth.Contract(contractCode.abi, contractReceipt.contractAddress);
                    var execResult = await contract.methods[scWorkflow[i].name](...parameters).call();
                }
                
                if(execResult.transactionHash || execResult) {
                    opSuccessCount++;
                }
                else {
                    execResult = false;
                    break;
                }
            }
            catch(e) {
                execResult = false;
                if (VERBOSE) tlog(e);
            }
        }
    }

    var endTime = performance.now();

    machines[machineId].load -= 1;

    if(execResult) {
        benchmarkDoneCount++;

        sharedBenchRes.push({
            timestamp: Date.now(),
            benchmark: idBench,
            success: true,
            time: (endTime - startTime),
            benchmarkDoneCount: benchmarkDoneCount,
            benchmarkErrorCount: benchmarkErrorCount
        })
    }
    else {
        benchmarkErrorCount++;

        sharedBenchRes.push({
            timestamp: Date.now(),
            benchmark: idBench,
            success: false,
            time: (endTime - startTime),
            benchmarkDoneCount: benchmarkDoneCount,
            benchmarkErrorCount: benchmarkErrorCount
        })
    }
}

function buildContract() {
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

    return {
        bytecode: output.contracts[benchmarkContractFN][benchmarkContractFN.split('.').slice(0, -1).join('.')].evm.bytecode.object,
        abi: output.contracts[benchmarkContractFN][benchmarkContractFN.split('.').slice(0, -1).join('.')].abi
    }
}

//deployContract
//- deploys a smart-contract
async function deployContract(machineId, accountId, constructorDef) {
    // Compile the source code
    const parameters = resolveParameters(constructorDef.parameters, machineId);
    
    //Deploy the contract and return instance
    const contract = await new machines[machineId]["provider"].eth.Contract(contractCode.abi)
    const contractData = contract.deploy({data: '0x' + contractCode.bytecode, arguments: parameters});

    return await buildAndSendTx(machineId, accountId, contractData.encodeABI());
}

//deployContract
//- deploys a smart-contract
async function callContract(machineId, accountId, callInfo, contractAddress) {
    // Compile the source code
    var parameters = resolveParameters(callInfo.parameters, machineId);
    
    //Deploy the contract and return instance
    const contract = await new machines[machineId]["provider"].eth.Contract(contractCode.abi)
    const contractData = contract.methods[callInfo.name](...parameters);

    return await buildAndSendTx(machineId, accountId, contractData.encodeABI(), contractAddress);
}

async function buildAndSendTx(machineId, accountId, data, contractAddress) {
    const rawTx = {
        nonce: machines[machineId]["provider"].utils.toHex(accounts[accountId].nonce),
        gasPrice: machines[machineId]["provider"].utils.toHex(0),
        gasLimit: machines[machineId]["provider"].utils.toHex(400000),
        data: data
    };

    if(contractAddress) {
        rawTx["to"] = contractAddress;
    }

    // In this example we create a transaction for a custom network.
    //
    // All of these network's params are the same than mainnets', except for name, chainId, and
    // networkId, so we use the Common.forCustomChain method.
    const customCommon = Common.forCustomChain(
        'mainnet',
        {
            name: 'benchmarkNetwork',
            networkId: machines[machineId]["provider"].utils.toHex(61795847),
            chainId: machines[machineId]["provider"].utils.toHex(61795847),
        },
        'istanbul',
        )

    // Sign and serialize the transaction
    const tx = new Tx(rawTx, { common: customCommon });
    tx.sign(Buffer.from(accounts[accountId].privateKey.substring(2), 'hex'));
    const serializedTx = tx.serialize();

    accounts[accountId].nonce++;
    return await machines[machineId]["provider"].eth.sendSignedTransaction('0x' + serializedTx.toString('hex'));
}

//resolveParameters
//- takes workflow parameters and change them dynamically with new benchmark informations if needed
function resolveParameters(params, machineId) {
    var parsedParams = []

    for(var i = 0; i < params.length; i++) {
        switch(params[i]) {
            case 'SENDER':
                parsedParams[i] = machines[machineId].address;
                break;

            case 'RANDINT':
                parsedParams[i] = parseInt(randomWithSeed()*1000000);
                break;
        }
    }

    return parsedParams;
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
async function runWorkflowWave() {
    setTimeout(runWorkflowWave, 1000);
    
    if(performance.now() - benchmarkStartTime > benchmarkDuration*1000) {
        if(INSTANT_STOP) {
            displayProgress(true);
            process.exit(0);
        }
        else {
            if(displayFinishMessage)
                tlog("All transactions have been sent, but the program keeps running to allow them to complete.")
            displayFinishMessage = false;
            getNonceSum();
        }
    }
    else {
        for(var i = 0; i< BENCH_POOL_SPEED; i++) {
            idBench++;
            runWorkflow(idBench);
        }
    }
}

async function getNonceSum() {
    var sum = 0;

    for(var i = 0; i < accounts.length; i++) {
        var nonceCount = await machines[0]["provider"].eth.getTransactionCount(accounts.address);
        sum+= nonceCount;
    }

    tlog('Somme des transactions : ' + sum);
}

//Main function
async function run() {
    createProvidersFromMachines();
    createResultRepIfNotDefined();
    await setAccounts(NB_ACCOUNTS);
    displayProgress(true);
    writeLoadRes();
    writeBenchRes();
        
    benchmarkStartTime = performance.now();
    runWorkflowWave(true)
}

run();