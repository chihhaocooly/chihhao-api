import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Index("testKey_UNIQUE", ["testKey"], { unique: true })
@Entity("test", { schema: "huang" })
export class Test {
  @PrimaryGeneratedColumn({ type: "int", name: "testKey" })
  testKey!: number;

  @Column("varchar", { name: "testTitle", length: 45 })
  testTitle!: string;

  @Column("varchar", { name: "testDescription", length: 45 })
  testDescription!: string;

  @Column("int", { name: "testPage", nullable: true })
  testPage!: number | null;
}
