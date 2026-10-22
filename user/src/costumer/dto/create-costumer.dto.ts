export class CreateCostumerDto {
    firstName!: string;
    lastName!: string;
    email!: string;
    password!: string;
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
