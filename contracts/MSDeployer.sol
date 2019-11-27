pragma solidity >=0.5.0;

contract Microservice {
    string private _name;
    bytes1[] private _dummy_array;

    constructor(string memory name) public {
        _name = name;
        _dummy_array.push(0x01);
    }
    
    function _run_instructions(uint limit) public view returns (uint){
        uint256[9999] memory res;
        uint resCounter = 0;
        
        for(uint256 i = 2; i < limit; i++) {
            bool isPrime = true;
            for(uint256 j = 2; j < i; j++) {
                if(i % j == 0 && i != j) {
                    isPrime = false;
                    break;
                }
            }
            
            if(isPrime) {
                res[resCounter] = i;
                resCounter++;
            }
        }
        
        return resCounter;
    }

    function _run_read(uint in_bytes_count) public view {
        for(uint i=0; i<=in_bytes_count; i++) {
            byte result = _dummy_array[0];
        }
    }

    function _run_write(uint out_bytes_count) public {
        for(uint i=0; i<=out_bytes_count; i++) {
            _dummy_array.push(0x01);
        }
    }

    function runOperations(uint instructions, uint in_bytes_count, uint out_bytes_count) public {
        this._run_instructions(instructions);
        this._run_read(in_bytes_count);
        this._run_write(out_bytes_count);
    }
}

contract Deployer {
    mapping(string => Microservice) private _microservices;

    function set_microservice(string memory name) public returns (address) {
        _microservices[name] = new Microservice(name);
        return address(_microservices[name]);
    }

    function get_microservice_address(string memory name) public view returns (address) {
        return address(_microservices[name]);
    }
    
    function cmp_str(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))) );
    }
}