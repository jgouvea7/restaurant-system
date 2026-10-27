import { VehicleType } from "../entities/courier.entity";

export class CreateCourierDto {
    firstName!: string;
    lastName!: string;
    email!: string;
    password!: string;
    courier!: {
        vehicleType: VehicleType;
        available: boolean;
    }
}
