export class CreateCostumerDto {
    firstName!: string;
    lastName!: string;
    status!: boolean;
    costumer!: {
        phone: string;
        address: {
            street: string;
            number: string;
            city: string;
            state: string;
            postalCode: string;
        }
    }
}
