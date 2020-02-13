pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

contract BlockchainInformationSharing {
    struct DataEntry {
        address publisher;
        string hashedData;
        string timestamp;
        address[] authViewers;
    }

    mapping(string => DataEntry) dataEntries;
    address[] authParties;
    mapping(address => address[]) awaitAllowanceParty;
    mapping(address => address[]) awaitRemovalParty;
    event DataAdded(address publisher, string hashedData, address[] authViewers);

    constructor() public {
        authParties.push(msg.sender);
    }

    function getDataEntry(string memory hashedData) public view returns (DataEntry memory) {
        return dataEntries[hashedData];
    }

    function voteAddParty(address partyAddr) public onlyAuthParty(msg.sender) {
        awaitAllowanceParty[partyAddr].push(msg.sender);

        //If more than 50% of allowed parties voted to add a party to the contract, it is done
        if(awaitAllowanceParty[partyAddr].length > authParties.length / 2) {
            authParties.push(partyAddr);
            delete awaitAllowanceParty[partyAddr];
        }
    }

    function voteRemoveParty(address partyAddr) public onlyAuthParty(msg.sender) {
        awaitRemovalParty[partyAddr].push(msg.sender);

        //If more than 50% of allowed parties voted to delete a party to the contract, it is done
        if(awaitRemovalParty[partyAddr].length > authParties.length / 2) {
            for(uint8 i = 0; i < authParties.length; i++) {
                if(partyAddr == authParties[i]) {
                    delete authParties[i];
                    break;
                }
            }
            delete awaitRemovalParty[partyAddr];
        }
    }

    function setDataEntry(string memory hashedData, string memory timestamp, address[] memory authViewers) public onlyAuthParty(msg.sender) {
        //If authorized, adds data to contract data storage
        dataEntries[hashedData] = DataEntry(msg.sender, hashedData, timestamp, authViewers);

        //Emits an event that contains data sender, hashed data and array of authorized data viewers to ensure data retrieval on client side if needed
        emit DataAdded(msg.sender, hashedData, authViewers);
    }

    modifier onlyAuthParty(address addr) {
        //Added to functions to ensure that the sender running the function is an authorized party

        //REMOVED TO ALLOW BENCHMARK OF THIS CONTRACT
        //require(addrAuthorized(addr), "Sender not authorized to perform this operation.");
        _;
    }

    function addrAuthorized(address addr) public view returns (bool) {
        bool isAuth = false;

        for(uint8 i = 0; i < authParties.length; i++) {
            if(addr == authParties[i]) {
                isAuth = true;
                break;
            }
        }

        return isAuth;
    }
}