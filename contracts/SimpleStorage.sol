pragma solidity >0.5.0;

contract SimpleStorage {
    uint a;
    uint b;

    constructor(uint newA, uint newB) public {
        a = newA;
        b = newB;
    }

    function setA(uint x) public {
        a = x;
    }

    function setB(uint x) public {
        b = x;
    }

    function getA() public view returns (uint) {
        return a;
    }

    function getB() public view returns (uint) {
        return b;
    }

    function getSum() public view returns (uint) {
        return a + b;
    }
}