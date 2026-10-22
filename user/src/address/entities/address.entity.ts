import { Costumer } from "src/costumer/entities/costumer.entity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Address {
    @PrimaryGeneratedColumn("uuid")
    id!: string

    @Column({ nullable: true })
    street!: string;

    @Column({ nullable: true })
    number!: string;

    @Column({ nullable: true })
    city!: string;

    @Column({ nullable: true })
    state!: string;

    @Column({ nullable: true })
    postalCode!: string;

    @Column({ type: "decimal", precision: 10, scale: 8, nullable: true })
    latitude!: number;

    @Column({ type: "decimal", precision: 11, scale: 8, nullable: true })
    longitude!: number;

    @ManyToOne(() => Costumer, (costumer) => costumer.address, {
        nullable: false
    })
    @JoinColumn({ name: "costumer_id" })
    costumer!: Costumer

}
