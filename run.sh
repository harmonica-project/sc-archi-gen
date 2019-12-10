#!/bin/bash
echo "Cleaning old benchmark files ..."
rm -rf ./benchmarks/*
rm -rf ./graphs/*

echo "Converting BPMNs to theirs JSON representations: "
python3 workflow-generator.py
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
