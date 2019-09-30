pragma solidity >0.5.0;
pragma experimental ABIEncoderV2;

contract Microservice {
    string private _name;
    uint private _instructions;
    uint private _in_bytes_count;
    uint private _out_bytes_count;
    byte[] _dummy_array;

    constructor(string memory name, uint instructions, uint in_bytes_count, uint out_bytes_count) public {
        _name = name;
        _instructions = instructions;
        _in_bytes_count = in_bytes_count;
        _out_bytes_count = out_bytes_count;
        _dummy_array.push(0x01);
    }
    
    function _run_instructions() public {
        uint j = 0;
        for(uint i=0; i<=_instructions; i++) {
            j++;
        }
    }

    function _run_read() public {
        for(uint i=0; i<=_in_bytes_count; i++) {
            byte result = _dummy_array[0];
        }
    }

    function _run_write() public {
        for(uint i=0; i<=_out_bytes_count; i++) {
            _dummy_array.push(0x01);
        }
    }

    function _run() public {
        this._run_instructions();
        this._run_read();
        this._run_write();
    }
}

contract Deployer {
    mapping(string => Microservice) private _microservices;
    string[] private _deployed_microservices;

    function set_microservice(string memory name, uint instructions, uint in_bytes_count, uint out_bytes_count) public returns (address) {
        _microservices[name] = new Microservice(name, instructions, in_bytes_count, out_bytes_count);
        _deployed_microservices.push(name);
        return address(_microservices[name]);
    }

    function get_microservice_address(string memory name) public returns (address) {
        return address(_microservices[name]);
    }

    function get_microservices_names() public returns (string[] memory) {
        return _deployed_microservices;
    }
}