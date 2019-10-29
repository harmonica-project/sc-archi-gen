#!/bin/bash
echo "Cleaning old benchmark files ..."
rm -rf ./benchmarks/*

echo "Generating benchmark files : "
node prepare_benchmarks.js
echo "Done."

echo "Preparing specified servers ..."
node prepare_servers.js

echo "Compiling and deploying smart-contracts ..."
truffle compile --all
truffle migrate --network infra --reset

echo "Running benchmark : "
node run_benchmarks.js

echo "Done."
pkill node