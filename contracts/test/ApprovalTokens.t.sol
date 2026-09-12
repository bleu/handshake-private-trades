// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {ResetApprovalToken} from "./fixtures/ResetApprovalToken.sol";

/// @title ApprovalTokensTest
/// @notice Verifies the public behavior of the direct-approval rejection fixture.
contract ApprovalTokensTest is Test {
    /// @notice A nonzero-to-nonzero approval reverts and preserves its existing allowance.
    function testDirectNonzeroApprovalRejected() public {
        ResetApprovalToken _token = new ResetApprovalToken(address(this), address(2));
        _token.approve(address(3), 10);
        vm.expectRevert(ResetApprovalToken.ResetApprovalToken_ResetRequired.selector);
        _token.approve(address(3), 50);
        assertEq(_token.allowance(address(this), address(3)), 10);
    }
}
