#!/bin/bash

displayCommands() {
    echo -e "   up - bootstrap an Ethereum network."
    echo -e "   down - turn off the network."
    echo -e "   run - launch the benchmark; the network must be up.\n"
}

displayCommandsRun() {
    echo -e "run should be executed with two arguments provided:"
    echo -e "   (int) benchmarkDuration"
    echo -e "   (string) smartContractName: the name of the smart-contract benchmarked.\n"
}

up() {
    echo "Preparing specified servers ..."
    node prepare_servers.js

    echo "Network online."
}

down() {
    echo "Not implemented yet."
}

run() {
    if [ "$1" = "--help" ]
    then
            displayCommandsRun
            exit 0
    elif [ "$1" = "" ]; then
            echo "You must provide the duration of the benchmark in seconds."; displayCommandsRun; exit 1;
    elif [ -n ${input//[0-9]/} ]; then
            echo "Illegal argument provided for benchmarkDuration, you must provide the duration in seconds."; displayCommandsRun; exit 1;
    elif [ "$1" < 1 ]; then
            echo "Illegal argument provided for benchmarkDuration, should be greater than 0."; displayCommandsRun; exit 1;
    fi 

    echo "Not implemented yet."
    
    #echo "Running benchmark : "
    #node run_benchmarks.js $2 $3

    #echo "Done."
    #pkill node
}

case $1 in 
    --help) displayCommands;;
    run) run $2 $3;;
    up) up;;
    down) down;;
    "") echo "You must provide an argument to perform operations."; displayCommands;;
    *) echo "Illegal argument - $1:"; displayCommands;;
esac 


