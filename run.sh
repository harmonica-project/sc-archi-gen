#!/bin/bash
echo "Cleaning old benchmark files ..."
rm -rf ./benchmarks/*

echo "Generating benchmark files : "
node prepare_benchmarks.js
echo "Done."

if [ $1 = "ganache" ]; then
        echo "Launching Ganache network ..."
        ganache-cli -p 7545 -i 5777 -l 0xFFFFFFFFFFFFF -g 0 -q &

        echo "Compiling and deploying smart-contracts ..."
        truffle compile --all
        truffle migrate --network ganache --reset

        echo "Running benchmark : "
        truffle exec run_benchmarks.js --network ganache

elif [ $1 = "infra" ]; then
        echo "Preparing specified servers ..."
        node prepare_servers.js

        echo "Compiling and deploying smart-contracts ..."
        truffle compile --all
        truffle migrate --network infra --reset

        echo "Running benchmark : "
        truffle exec run_benchmarks.js --network infra
fi

echo "Done."
pkill node