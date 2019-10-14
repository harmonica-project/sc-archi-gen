pragma solidity >0.5.0;
pragma experimental ABIEncoderV2;

contract Microservice {
    string private _name;
    byte[] private _dummy_array;

    constructor(string memory name) public {
        _name = name;
        _dummy_array.push(0x01);
    }
    
    function _run_instructions(uint instructions) public view {
        uint j = 0;
        for(uint i=0; i<=instructions; i++) {
            j++;
        }
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
    string[] private _deployed_microservices;

    function set_microservice(string memory name) public returns (address) {
        _microservices[name] = new Microservice(name);
        _deployed_microservices.push(name);
        return address(_microservices[name]);
    }

    function unset_microservice(string memory name) public {
        delete _microservices[name];
        for(uint i=0; i<_deployed_microservices.length; i++) {
            if(cmp_str(_deployed_microservices[i], name)) {
                delete _deployed_microservices[i];
                break;
            }
        }
    }

    function get_microservice_address(string memory name) public view returns (address) {
        return address(_microservices[name]);
    }

    function get_microservices_names() public view returns (string[] memory) {
        return _deployed_microservices;
    }
    
    function cmp_str(string memory a, string memory b) public pure returns (bool) {
        return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))) );
    }
}