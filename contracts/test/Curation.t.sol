// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Curation} from "../src/Curation.sol";

contract CurationTest is Test {
    Curation internal curation;
    address internal curator = makeAddr("curator");
    address internal listener = makeAddr("listener");

    function setUp() public {
        curation = new Curation();
    }

    function test_DropAssignsIdAndCurator() public {
        vm.prank(curator);
        uint256 id = curation.drop(keccak256("rec"), keccak256("note"));
        assertEq(id, 0);
        assertEq(curation.curatorOf(0), curator);
        assertEq(curation.nextId(), 1);
    }

    function test_SaveForwardsTip() public {
        vm.prank(curator);
        uint256 id = curation.drop(keccak256("rec"), keccak256("note"));

        vm.deal(listener, 1 ether);
        vm.prank(listener);
        curation.save{value: 0.5 ether}(id);

        assertEq(curator.balance, 0.5 ether);
        assertEq(address(curation).balance, 0);
    }

    function test_RevertWhen_SavingUnknownDrop() public {
        vm.prank(listener);
        vm.expectRevert(Curation.BadDrop.selector);
        curation.save(42);
    }

    function test_RevertWhen_CuratorSavesOwnDrop() public {
        vm.startPrank(curator);
        uint256 id = curation.drop(keccak256("rec"), keccak256("note"));
        vm.expectRevert(Curation.BadDrop.selector);
        curation.save(id);
        vm.stopPrank();
    }
}
