pragma solidity >=0.5.0;

contract Microservice {
    mapping(string => bytes1[]) _dummy_storage;

    constructor() public {
        _dummy_storage["singleElt"].push(0x01);
    }
    
    function _run_instructions(uint limit) public pure returns (uint){
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

    function _run_read(uint in_bytes_count) public view returns (byte) {
        byte result;

        for(uint i=0; i <= in_bytes_count; i++) {
            result = _dummy_storage["singleElt"][0];
        }

        return result;
    }

    function _run_write(uint out_bytes_count, string memory runId) public {
        for(uint i=0; i <= out_bytes_count; i++) {
            _dummy_storage[runId].push(0x01);
        }
    }

    function runOperations(string memory runId, uint instructions, uint in_bytes_count, uint out_bytes_count) public {
        this._run_instructions(instructions);
        this._run_read(in_bytes_count);
        this._run_write(out_bytes_count, runId);
    }
}