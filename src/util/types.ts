export interface EscrowFinishDb {
    account: string,
    sequence: number,
    finishafter: Date,
    testnet: boolean,
}

export interface BurnTransactionDb {
    account: string,
    transactiontype: string,
    tx_hash: string,
    fee: string,
    operationlimit: number,
    imported: boolean
}