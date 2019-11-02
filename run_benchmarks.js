var deployerABI = require('./build/contracts/Deployer.json');
var microserviceABI = require('./build/contracts/Microservice.json');
var machines = require('./ip_list.json');

const Web3 = require('web3')
const fs = require('fs');
const {performance} = require('perf_hooks');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const BENCH_LIMIT = 100

const csvWriterBench = createCsvWriter({
    path: './results/bench/res_' + Date.now() + '.csv',
    header: [
        {id: 'timestamp', title: 'TIMESTAMP'},
        {id: 'benchmark', title: 'BENCHMARK'},
        {id: 'path', title: 'PATH'},
        {id: 'microservice', title: 'MICROSERVICE'},
        {id: 'time', title: 'TIME'}
    ]
});

const csvWriterLoad = createCsvWriter({
    path: './results/load/res_' + Date.now() + '.csv',
    header: generateLoadHeader()
});

var benchResults = [];
var loadResults = [];
var deploymentErrCount = 0;
var execErrCount = 0;
var msCount = 0;
var opCount = 0;

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

    for (let [key, node] of Object.entries(bench_file.components)) {
        if(node.himself.type == "choreographyTask" || node.himself.type == "task") msList.push(node.himself.id);
    }

    return msList;
}

//generateMicroservices
//- deploy a smart-contract microservice and store its address
function setMicroservice(name, inst) {
    return new Promise((resolve) => {
        try {
            inst.methods.set_microservice(name).send({from: machines[0].address},(error, addr) => {
                if (!error) {
                    inst.methods.get_microservice_address(name).call({from: machines[0].address},(error, addr) => {
                        if (!error) {
                            resolve([name, addr])
                            msCount++;
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
async function generateMicroservices(inst, bench_file) {
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
            return microservices;
        })
}

//runBPMN
//- resolve the BPMN by launching every microservices tasks
async function runBenchmarks(microservices, benchInfo, file) {
    var paths = benchInfo.paths;
    var components = benchInfo.components;

    for(var i = 0; i < paths.length; i++) {
        var path = paths[i];
        
        for(j = 0; j < path.length; j++) {
            var steps = path[j];
            var awaitMs = [];

            steps.forEach(step => {
                if(components[step].himself.type === "choreographyTask" || components[step].himself.type == "task") {
                    var name = components[step].himself.id;
                    awaitMs.push(runMicroservice(name, microservices[name], components[step].himself.payload, file, i));
                }
            })
            
            await Promise.all(awaitMs);
        }
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

function displayProgress() {
    console.log("Microservices executed: " + opCount + "/" + msCount + "\n");
    setTimeout(displayProgress, 1000);
}

//runMicroservice
//- execute dummy tasks inside a microservice and monitor required time to execution
async function runMicroservice(name, addr, tasks, file, pathId) {
    //Coefficients of ponderation came from Ethereum OPCODE gas cost sheet
    var difficulty = tasks.instructions*6 + tasks.in_bytes_count*203 + tasks.out_bytes_count*5003;
    var machineId = allocateTaskToMachine(difficulty);

    try {
        var msInst = new machines[machineId].provider.eth.Contract(microserviceABI.abi, addr);

        var tStart = performance.now();
        let result = await msInst.methods.runOperations(tasks.instructions, tasks.in_bytes_count, tasks.out_bytes_count).send({from: machines[machineId].address});
        var tEnd = performance.now();

        if(!result.transactionHash) {
            console.error('Error : Microservice ' + name + ' transaction failed.');
            execErrCount++;
        }
        else {
                benchResults.push({
                    timestamp: Date.now(),
                    benchmark: file,
                    path: pathId,
                    microservice: name,
                    time: (tEnd - tStart)
                });
        }
    }
    catch(e) {
        console.error('Error while running microservice ' + name + ': ' + e);
        execErrCount++;
    }
    finally {
        machines[machineId].load -= difficulty;
        opCount++;
    }
}

function createProvidersFromMachines() {
    for(var i = 0; i < machines.length; i++) {
        machines[i]["provider"] = new Web3('http://' + machines[i].ip + ':8545');
        machines[i]["load"] = 0;
        machines[i].provider.eth.defaultAccount = machines[i].address;
    }
}

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

async function run() {
    createProvidersFromMachines();
    createResultRepIfNotDefined();

    var inst = new machines[0].provider.eth.Contract(deployerABI.abi, deployerABI.networks["61997"].address);

    if(inst) {
        var files = fs.readdirSync('./benchmarks');
        var benchmarks = [];
        var promises = [];

        var limit = Math.min(BENCH_LIMIT, files.length)

        for(var i = 0; i < limit; i++) {
            file = files[i];
            benchInfo = require('./benchmarks/' + file);
            console.log('Generating microservices for ' + file + '...');
            benchmarks.push({msList: await generateMicroservices(inst, benchInfo),benchInfo: benchInfo});
        }

        displayProgress();
        monitorLoad(true);

        for(var i = 0; i < limit; i++) {
            file = files[i];
            console.log('Running benchmark ' + file + '...');
            promises.push(runBenchmarks(benchmarks[i].msList, benchmarks[i].benchInfo, file));
        }

        await Promise.all(promises)
            .then(() => {
                csvWriterBench.writeRecords(benchResults)       // returns a promise
                    .then(() => {
                        csvWriterLoad.writeRecords(loadResults)       // returns a promise
                            .then(() => {
                                console.log('Benchmark completed and results stored. Deployment errors: ' + deploymentErrCount + ', execution errors: ' + execErrCount + '.');
                                process.exit(0);
                            });
                    });
            })
    }
    else {
        console.error("Can't deploy microservices: provider not working.")
    }
}

run()