const Microservice = artifacts.require("Microservice");

module.exports = function(deployer) {
  deployer.deploy(Microservice);
};
