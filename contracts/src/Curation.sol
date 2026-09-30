// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Curation
/// @notice Records song drops and forwards tips from listeners straight to curators.
/// @dev Never holds funds: every tip is forwarded in the same call.
contract Curation {
    /// @notice Emitted when a curator records a drop.
    /// @param dropId The new drop's id.
    /// @param curator The address that made the drop.
    /// @param recordingId Hash of the recording id.
    /// @param noteHash Hash of the drop's note.
    event Dropped(uint256 indexed dropId, address indexed curator, bytes32 recordingId, bytes32 noteHash);

    /// @notice Emitted when a listener saves a drop, with or without a tip.
    /// @param dropId The saved drop's id.
    /// @param listener The address that saved the drop.
    /// @param tip The tip in wei, forwarded to the curator.
    event Saved(uint256 indexed dropId, address indexed listener, uint256 tip);

    /// @notice Thrown when the drop does not exist or the caller is its curator.
    error BadDrop();

    /// @notice Thrown when forwarding the tip to the curator fails.
    error TipFailed();

    /// @notice The curator of each drop.
    mapping(uint256 => address) public curatorOf;

    /// @notice The id the next drop will get.
    uint256 public nextId;

    /// @notice Records a drop made by the caller.
    /// @param recordingId Hash of the recording id.
    /// @param noteHash Hash of the drop's note.
    /// @return id The new drop's id.
    function drop(bytes32 recordingId, bytes32 noteHash) external returns (uint256 id) {
        id = nextId++;
        curatorOf[id] = msg.sender;
        emit Dropped(id, msg.sender, recordingId, noteHash);
    }

    /// @notice Saves a drop and forwards any attached MON to its curator.
    /// @param dropId The drop to save.
    function save(uint256 dropId) external payable {
        address curator = curatorOf[dropId];
        if (curator == address(0) || curator == msg.sender) revert BadDrop();
        emit Saved(dropId, msg.sender, msg.value);
        // forge-lint: disable-next-line(arbitrary-send-eth)
        (bool ok,) = curator.call{value: msg.value}("");
        if (!ok) revert TipFailed();
    }
}
