#!/bin/bash

echo "Launching blockchain network ..."
ganache-cli -p 7545 -i 5777 -q &

echo "Compiling and deploying smart-contracts ..."
truffle compile
truffle migrate

echo "Running benchmark : "
truffle execute benchmark.js
echo "Benchmark done."
pkill node