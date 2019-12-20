#--- ON CLIENT ---

#Deleting old pub/pri keys and Eth files on client
rm -rf ./datadir/*
mkdir ./datadir/nodekeys

#Generating a Eth public/private key file for each node using a password and specifying a directory to store them
geth account new --datadir ./datadir --password ./ethereum/password

#Using bootnode command to get account node key (and thus enode with the second command)
bootnode -genkey ./datadir/nodekeys/nodekey<node id>
bootnode -nodekey ./datadir/nodekeys/nodekey<node id> --writeaddress

#Compiling all enodes and node infos to generate static-nodes.js file

touch static-nodes.js
#Perform the command n time, n being the number of nodes
echo "enode://<enode>@<node IP addr>:30303>/n" > static-nodes.js

#Compiling blockchain info and node wallets into genesis.json using the JS template (I don't know how to do that in Salt)

#--- ON NODES ---

#Setup working directory for correct Geth boot
sudo rm -rf <node working directory>/* ; mkdir -p <node working directory>/datadir/keystore
mkdir -p <node working directory>/datadir/geth
pkill -9 geth; sudo rm /var/log/geth.log
sudo touch /var/log/geth.log
sudo chmod 777 /var/log/geth.log

#--- ON CLIENT ---

#Transfer eth files from client to each node
#- genesis file
#- node account
#- node key
#- node password
#- static-nodes.js

#--- ON NODES ---
#Initialize Geth blockchain from genesis file
geth --datadir <node working directory>/datadir init <node working directory>/genesis.json

#Launch Geth on node
geth --datadir "<node working directory>/datadir" 
--networkid 61795847 
--nodekey <node working directory>/datadir/geth/nodekey 
--rpc --rpcport 8545 --rpcaddr <node IP addr> --rpccorsdomain "*" --rpcapi "eth,net,web3,personal,miner,admin,clique" 
--allow-insecure-unlock --unlock <node Eth addr> --password <node working directory>/password &>/var/log/geth.log --gasprice 0 --mine --nodiscover --syncmode "full"