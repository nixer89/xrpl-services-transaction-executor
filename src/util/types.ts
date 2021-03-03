export interface EscrowFinish {
    account: string,
    sequence: number,
    finishAfter: Date,
    testnet: boolean
}