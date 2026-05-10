package com.gymapp.backend.controller;

public class AccountDeletedException extends ApiException {
    public AccountDeletedException() {
        super("ACCOUNT_DELETED", "TrainFrame account was deleted", null);
    }
}
