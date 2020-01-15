# Supply chain smart-contract benchmarking

## Introduction

This tool is derived from the master branch, in order to provide a functional plateform for an experimental benchmark on supply-chain applications from previous developments.

**Note: this tool does not take care of node security and therefore should not be used in production. This is an experiment-only tool.**

## Requirements

- node.js (currently used here: 10.18)
- npm (currently used here: 6.12.0)
- solc (not all versions work, 0.5.0 is fine)
- web3 (currently used here: 1.2.2)

## How to setup the project before running the benchmark

*If you're using Vagrant, you can boot your nodes with the Vagrantfile located in the vagrant folder (note that you can choose the number of nodes by changing the NODE_COUNT variable inside the Vagrantfile), and execute the script called generate_config.js (which takes as an argument the number of nodes desired, put the same number of nodes as chose in the Vagrantfile) to generate the file containing login information of the nodes and the truffle-config.js:*

```
cd vagrant
vagrant up
node generate_config.js {nbNodes}
```

*In this case, skip the first two steps below.*

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

2. Install required packages by typing:

```
npm install
```

## How to launch the benchmark

Execute the following two commands to bring up the network then perform the experiment, with two respective parameters: contract name and benchmark time.

```
./bench.sh up 
./bench.sh run mycontract.sol 300 
```

Results will be stored inside the *results* directory.

The blockchain network can be turned off using this command:

```
./bench.sh down
```