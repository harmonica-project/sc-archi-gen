#!/bin/bash

echo "Launching blockchain network ..."
ganache-cli -p 7545 -i 5777 -l 0xFFFFFFFFFFFFF -g 0 -q &

echo "Compiling and deploying smart-contracts ..."
truffle compile
truffle migrate

echo "Cleaning old benchmark files ..."
rm -rf ./benchmarks/*

echo "Generating benchmark files : "
node prepare_benchmarks.js
echo "Done."

echo "Running benchmark : "
truffle exec run_benchmarks.js
echo "Done."
pkill node