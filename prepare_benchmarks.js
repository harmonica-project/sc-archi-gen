var fs = require('fs');

var components = {}
var paths = []

//getBPMNComponents
//- get all BPMN components
function getBPMNComponents(bpmn) {
    components = {};
    let complexity = 500;

    bpmn.nodes.forEach(node => {
        components[node.id] = {
            prerequisites: [],
            targets: [],
            himself: node
        }

        components[node.id].himself.payload.instructions = Math.round(Math.random() * complexity);
        components[node.id].himself.payload.in_bytes_count = Math.round(Math.random() * complexity);
        components[node.id].himself.payload.out_bytes_count = Math.round(Math.random() * complexity);
        components[node.id].himself.payload.dummy_padding = Math.round(Math.random() * complexity);
    })

    bpmn.links.forEach(link => {
        components[link.target].prerequisites.push(link.source);
        components[link.source].targets.push(link.target);
    });
}

//getBPMNPaths
//- get every possible path in the BPMN
function getBPMNPaths() {
    paths = [];
    var component = components["START"];
    getNextPath(component, 0, 0);
}

//getNextPath
//- recursive function which add a step to a path, and create alternative paths for each parallel gate in the bpmn
function getNextPath(c, idPath, idStep) {
    if(c.himself.type !== "parallelGateway") {
        if(!paths[idPath]) 
            paths[idPath] = [];
        if(!paths[idPath][idStep]) 
            paths[idPath][idStep] = [];
        if(!paths[idPath][idStep].includes(c.himself.id)) 
            paths[idPath][idStep].push(c.himself.id);

        if(c.himself.type == "exclusiveGateway") {
            var newPathId = idPath;

            c.targets.forEach(t => {
                paths[newPathId] = paths[idPath].slice(0, idStep + 1);
                getNextPath(components[t], newPathId, (idStep + 1));
                while(paths[newPathId] && paths[newPathId] !== []) newPathId++;
            })
        }
        else if(c.himself.type == "endEvent") {
            return;
        }
        else {
            c.targets.forEach(t => {
                getNextPath(components[t], idPath, (idStep + 1));
            })
        }
    }
    else {
        if(checkParallelGatePrerequisites(c, idPath)) {
            if(!paths[idPath][idStep]) 
                paths[idPath][idStep] = [];
            if(!paths[idPath][idStep].includes(c.himself.id)) 
                paths[idPath][idStep].push(c.himself.id);

            c.targets.forEach(t => {
                getNextPath(components[t], idPath, (idStep + 1));
            })
        }
    }
}

//checkParallelGatePrerequisites
//- verify that every step before a parallel gate is already positionned in the path before adding the parallel gate to the path 
function checkParallelGatePrerequisites(c, idPath) {
    for(var k = 0; k < c.prerequisites.length; k++) {
        prerequisite = c.prerequisites[k];
        found = false;

        for(var i = paths[idPath].length - 1; i > 0; i--) {
            if(paths[idPath][i].includes(prerequisite)) {
                found = true;
            }
        }
        if(!found) return false;
    }
    return true;
}

//getBPMNJson
//- get all BPMN json representation and stores it into a variable
function getBPMNJson() {
    var bpmns = [];
    var files = fs.readdirSync('./samples');

    try {
        files.forEach(file => {
            bpmns.push([require('./samples/' + file), file]);
        })    
    }
    catch(e) {
        console.log(e);
    }

    return bpmns;
}

////////////////////////////////////////

bpmns = getBPMNJson();

bpmns.forEach(bpmn => {    
    getBPMNComponents(bpmn[0]);
    getBPMNPaths();
    
    try {
        var benchmark = {
            components: components,
            paths: paths
        }

        jsonB = JSON.stringify(benchmark);
        fs.writeFile('./benchmarks/bench_' + bpmn[1], jsonB, (err, result) => {
            if(err) console.log(err);
        }); 
    }
    catch(e) {
        console.log(e);
    }
})