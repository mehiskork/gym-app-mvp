package com.gymapp.backend.model;

public record SyncAck(
                String opId,
                String status,
                String reason) {
}
