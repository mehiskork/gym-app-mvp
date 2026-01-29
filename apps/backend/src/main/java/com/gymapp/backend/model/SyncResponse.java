package com.gymapp.backend.model;

import java.util.List;
import lombok.AllArgsConstructor;
import lombok.AccessLevel;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SyncResponse {
    private final List<SyncAck> acks;
    private final String cursor;
    private final List<SyncDelta> deltas;
    @Getter(AccessLevel.NONE)
    private final boolean hasMore;

    public boolean getHasMore() {
        return hasMore;
    }
}