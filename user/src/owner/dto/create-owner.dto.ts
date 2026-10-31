export class CreateOwnerDto {
    firstName!: string;
    lastName!: string;
    email!: string;
    password!: string;
    owner!: {
        userId: string;
        document: string;
    }
}
