# Solidity microservice architecture benchmarking

## Introduction

The goal of this Javascript program is to convert a representation of a BPMN diagram to a microservice architecture made of smart-contracts, then benchmarking the execution of the BPMN from start to end. 

For now, the benchmark executes every step of the BPMN but the goal is to benchmark random paths.

**Note: this tool does not take care of node security and therefore should not be used in production. This is an experiment-only tool.**

## Requirements

- truffle (currently used here: 5.0.42)
- node.js (currently used here: 10.16.3)
- npm (currently used here: 6.12.0)
- solidity compiler (installed version should be 0.5.0 or higher)
- web3 (currently used here: 1.2.2)

## How to setup the project before running the benchmark

*If you're using Vagrant, you can boot your nodes with the Vagrantfile located in the vagrant folder (note that you can choose the number of nodes by changing the NODE_COUNT variable inside the Vagrantfile), and execute the script called generate_config.js (which takes as an argument the number of nodes desired, put the same number of nodes as chose in the Vagrantfile) to generate the file containing login information of the nodes and the truffle-config.js:*

```
cd vagrant
vagrant up
node generate_config.js {nbNodes}
```

*In this case, skip the first two steps below*

1. First, you need to provide the username, the password, and the IP of every node which will be used. To do that, create a file named ip_list.json in the main directory, made of login information:


```
    [
        {
            "ip":"10.0.0.11",
            "user":"vagrant",
            "password":"vagrant"
        },{
            "ip":"10.0.0.12",
            "user":"vagrant",
            "password":"vagrant"
        },{
            ...
        }
    ]
```

**If you're login with SSH instead of password, please don't put a password key/value inside this file, but instead, modify the global variable named SSH_KEY located inside *prepare_servers.js*. This variable represents the path of your SSH private key.**

2. Create a file called truffle-config.js containing information about the blockchain. It will be used by Truffle to login later. For the host field, put the IP of your first node declared in the ip_list.json file:

```
module.exports = {
    "networks":{
        "infra":{
            "host":"10.0.0.11",
            "port":8545,
            "network_id":61997,
            "gasLimit":"0x346DC5D638865",
            "gasPrice":"0x0"
        }
    },
    "compilers":{
        "solc":{
            "version":"0.5.0"
        }
    }
}
```

3. Finally, install required packages (*ssh2*, *web3* and *Truffle CLI*) by typing:

```
npm install
npm install truffle
npm install web3
```

## How to launch the benchmark

Just execute the run.sh script:

```
./run.sh
```

Results will be stored inside the *results* directory.