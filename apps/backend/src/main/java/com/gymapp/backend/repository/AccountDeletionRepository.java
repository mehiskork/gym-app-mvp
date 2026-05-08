package com.gymapp.backend.repository;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class AccountDeletionRepository {
    private final NamedParameterJdbcTemplate jdbcTemplate;

    public AccountDeletionResult deleteAccountData(String accountOwnerId) {
        List<String> linkedGuestScopes = findLinkedGuestScopes(accountOwnerId);
        Set<String> allDeletionScopes = new LinkedHashSet<>();
        allDeletionScopes.add(accountOwnerId);
        allDeletionScopes.addAll(linkedGuestScopes);

        int deviceTokenRowsDeleted = deleteDeviceTokensForLinkedGuestScopes(linkedGuestScopes);
        int opLedgerRowsDeleted = deleteByGuestUserId("op_ledger", allDeletionScopes);
        int changeLogRowsDeleted = deleteByGuestUserId("change_log", allDeletionScopes);
        int entityStateRowsDeleted = deleteByGuestUserId("entity_state", allDeletionScopes);
        int claimRowsDeleted = deleteClaimRows(accountOwnerId, linkedGuestScopes);
        int identityLinkRowsDeleted = deleteByUserId("identity_link", accountOwnerId);
        int migrationAuditRowsDeleted = deleteByUserId("guest_account_migration_audit", accountOwnerId);
        int deviceRowsDeleted = deleteDevicesForLinkedGuestScopes(linkedGuestScopes);

        return new AccountDeletionResult(
                linkedGuestScopes.size(),
                deviceTokenRowsDeleted,
                opLedgerRowsDeleted,
                changeLogRowsDeleted,
                entityStateRowsDeleted,
                claimRowsDeleted,
                identityLinkRowsDeleted,
                migrationAuditRowsDeleted,
                deviceRowsDeleted);
    }

    public List<String> findLinkedGuestScopes(String accountOwnerId) {
        return jdbcTemplate.queryForList(
                """
                        SELECT guest_user_id
                        FROM identity_link
                        WHERE user_id = :accountOwnerId
                        UNION
                        SELECT guest_user_id
                        FROM guest_account_migration_audit
                        WHERE user_id = :accountOwnerId
                        UNION
                        SELECT guest_user_id
                        FROM claim
                        WHERE claimed_by_user_id = :accountOwnerId
                        """,
                Map.of("accountOwnerId", accountOwnerId),
                String.class);
    }

    private int deleteDeviceTokensForLinkedGuestScopes(List<String> linkedGuestScopes) {
        if (linkedGuestScopes.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(
                """
                        DELETE FROM device_token
                        WHERE device_id IN (
                            SELECT device_id
                            FROM device
                            WHERE guest_user_id IN (:linkedGuestScopes)
                        )
                        """,
                new MapSqlParameterSource("linkedGuestScopes", linkedGuestScopes));
    }

    private int deleteDevicesForLinkedGuestScopes(List<String> linkedGuestScopes) {
        if (linkedGuestScopes.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(
                """
                        DELETE FROM device
                        WHERE guest_user_id IN (:linkedGuestScopes)
                        """,
                new MapSqlParameterSource("linkedGuestScopes", linkedGuestScopes));
    }

    private int deleteByGuestUserId(String tableName, Set<String> ownerScopes) {
        if (ownerScopes.isEmpty()) {
            return 0;
        }
        return jdbcTemplate.update(
                "DELETE FROM " + tableName + " WHERE guest_user_id IN (:ownerScopes)",
                new MapSqlParameterSource("ownerScopes", ownerScopes));
    }

    private int deleteByUserId(String tableName, String accountOwnerId) {
        return jdbcTemplate.update(
                "DELETE FROM " + tableName + " WHERE user_id = :accountOwnerId",
                Map.of("accountOwnerId", accountOwnerId));
    }

    private int deleteClaimRows(String accountOwnerId, List<String> linkedGuestScopes) {
        if (linkedGuestScopes.isEmpty()) {
            return jdbcTemplate.update(
                    """
                            DELETE FROM claim
                            WHERE claimed_by_user_id = :accountOwnerId
                            """,
                    Map.of("accountOwnerId", accountOwnerId));
        }
        return jdbcTemplate.update(
                """
                        DELETE FROM claim
                        WHERE claimed_by_user_id = :accountOwnerId
                           OR guest_user_id IN (:linkedGuestScopes)
                        """,
                new MapSqlParameterSource()
                        .addValue("accountOwnerId", accountOwnerId)
                        .addValue("linkedGuestScopes", linkedGuestScopes));
    }

    public record AccountDeletionResult(
            int linkedGuestScopeCount,
            int deviceTokenRowsDeleted,
            int opLedgerRowsDeleted,
            int changeLogRowsDeleted,
            int entityStateRowsDeleted,
            int claimRowsDeleted,
            int identityLinkRowsDeleted,
            int migrationAuditRowsDeleted,
            int deviceRowsDeleted) {
    }
}
