module.exports = {

  networks: {
    ganache: {
      host: "127.0.0.1",     
      port: 7545,            
      network_id: 5777,      
    },

    infra: {
      host: "172.16.72.5",     
      port: 8545,            
      network_id: 666,       
      gasLimit: "0x346DC5D638865",
      gasPrice: "0x0",
    },

  },

  mocha: {
    // timeout: 100000
  },

  compilers: {
    solc: {
      version: "0.5.0"
    }
  }
}
