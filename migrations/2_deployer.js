const Deployer = artifacts.require("Deployer");

module.exports = function(deployer) {
  deployer.deploy(Deployer);
};
